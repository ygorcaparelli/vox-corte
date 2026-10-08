import {Input,ALL_FORMATS,CustomSource,VideoSampleSink,AudioBufferSink} from 'mediabunny';
import {Cut,Zoom,keptSegments,originalToEdited} from './editor';
import {compileZooms,zoomAt} from './zoom';

type Frame={at:number;end:number;image:OffscreenCanvas};
type Audio={at:number;end:number;buffer:AudioBuffer;offset:number;duration:number;scheduled:boolean};
type Callbacks={time:(original:number)=>void;playing:(playing:boolean)=>void;error:(error:unknown)=>void};
const delay=()=>new Promise<void>(resolve=>setTimeout(resolve,12));
const AHEAD=5,MAX_FRAMES=160;

export function* previewFrames(segments:ReturnType<typeof keptSegments>,from:number,fps:number){
  const step=1/Math.min(30,Math.max(1,fps));
  for(const segment of segments){
    if(segment.editedEnd<=from)continue;
    const start=Math.max(from,segment.editedStart);
    for(let at=start;at<segment.editedEnd-1e-7;at+=step){
      yield {at,end:Math.min(at+step,segment.editedEnd),original:segment.start+at-segment.editedStart};
    }
  }
}

export function audioSlice(timestamp:number,duration:number,start:number,end:number){
  const from=Math.max(timestamp,start),to=Math.min(timestamp+duration,end);
  return to>from?{start:from,offset:from-timestamp,duration:to-from}:null;
}

export class SmoothPlayback {
  private input:Input;
  private video!:VideoSampleSink;
  private images:OffscreenCanvas[]=[];
  private imageIndex=0;
  private audio:AudioBufferSink|null=null;
  private context!:AudioContext;
  private gain!:GainNode;
  private segments:ReturnType<typeof keptSegments>=[];
  private cuts:Cut[]=[];
  private zooms:Zoom[]=[];
  private compiledZooms:Zoom[]=[];
  private displayed:Frame|undefined;
  private lastDraw:{frame:Frame;scale:number;x:number;y:number}|undefined;
  private frames:Frame[]=[];
  private buffers:Audio[]=[];
  private nodes=new Set<AudioBufferSourceNode>();
  private iterators=new Set<AsyncGenerator>();
  private generation=0;
  private epoch=0;
  private position=0;
  private running=false;
  private pendingPlay=false;
  private disposed=false;
  private animation=0;
  private total=0;
  private videoThrough=0;
  private audioThrough=0;
  private publishAt=0;
  private volume=1;
  private muted=false;
  ready=false;

  constructor(private canvas:HTMLCanvasElement,url:string,private duration:number,private fps:number,private callbacks:Callbacks){
    canvas.dataset.ready='false';canvas.dataset.seeking='true';canvas.dataset.zoom='1';delete canvas.dataset.presentedTime;
    const controller=new AbortController();
    const range=async(start:number,end:number)=>{
      const response=await fetch(url,{headers:{Range:`bytes=${start}-${end-1}`},signal:controller.signal});
      if(response.status!==206||!response.body)throw Error('O serviço local não respondeu à leitura parcial do vídeo.');
      return response;
    };
    this.input=new Input({formats:ALL_FORMATS,source:new CustomSource({
      getSize:async()=>{const response=await range(0,1);const size=Number(response.headers.get('Content-Range')?.split('/')[1]);await response.body!.cancel();if(!Number.isFinite(size)||size<=0)throw Error('Tamanho do vídeo indisponível.');return size;},
      read:async(start,end)=>(await range(start,end)).body!,
      maxCacheSize:32*1024*1024,prefetchProfile:'network',dispose:()=>controller.abort(),
    })});
  }
  async initialize(){
    const v=await this.input.getPrimaryVideoTrack(),a=await this.input.getPrimaryAudioTrack();
    if(this.disposed)return;
    if(!v||!await v.canDecode()||(a&&!await a.canDecode()))throw Error('Este formato precisa de uma prévia compatível para reprodução fluida.');
    if(this.disposed)return;
    const width=Math.min(960,await v.getDisplayWidth());
    this.video=new VideoSampleSink(v,{hardwareAcceleration:'no-preference'});
    this.audio=a?new AudioBufferSink(a):null;
    this.context=new AudioContext({sampleRate:a?await a.getSampleRate():undefined});
    this.gain=this.context.createGain();this.gain.connect(this.context.destination);
    this.canvas.width=width;this.canvas.height=Math.round(width*await v.getDisplayHeight()/await v.getDisplayWidth());
    if(this.disposed){void this.context.close();return;}
    this.ready=true;this.canvas.dataset.ready='true';
    this.reset(this.position);this.loop();
    while(!this.disposed&&this.total&&this.canvas.dataset.seeking==='true')await delay();
  }
  setCuts(cuts:Cut[]){
    const original=this.originalAt(this.clock());
    this.pause();this.cuts=cuts;this.segments=keptSegments(cuts,this.duration);
    this.total=this.segments.at(-1)?.editedEnd||0;
    this.compiledZooms=compileZooms(this.zooms,cuts,this.duration);
    this.position=originalToEdited(original,cuts,this.duration);
    if(this.ready)this.reset(this.position);
  }
  seekOriginal(time:number){this.seek(originalToEdited(time,this.cuts,this.duration));}
  setZooms(zooms:Zoom[]){this.zooms=zooms;this.compiledZooms=compileZooms(zooms,this.cuts,this.duration);}
  seek(time:number){
    const resume=this.running||this.pendingPlay;
    this.pause();this.position=Math.max(0,Math.min(this.total,time));
    this.publish(true);if(this.ready)this.reset(this.position);
    if(resume&&this.position<this.total)void this.play().catch(e=>this.fail(e,this.generation));
  }
  async play(){
    if(!this.ready||this.running||this.pendingPlay||!this.total)return;
    if(this.position>=this.total)this.reset(0);
    this.pendingPlay=true;this.canvas.dataset.buffering='true';this.callbacks.playing(true);const id=this.generation;
    await this.context.resume();
    const needed=Math.min(this.total,this.position+4);
    // Warm both streams before starting one shared clock, including across cuts.
    while(id===this.generation&&!this.disposed&&this.pendingPlay&&(this.videoThrough<needed||this.audioThrough<needed))await delay();
    if(id!==this.generation||this.disposed||!this.pendingPlay)return;
    this.pendingPlay=false;this.canvas.dataset.buffering='false';this.running=true;this.epoch=this.context.currentTime+.04-this.position;
    this.canvas.dataset.playing='true';this.callbacks.playing(true);this.scheduleAudio();
  }
  pause(){
    if(this.running)this.position=this.clock();
    this.running=false;this.pendingPlay=false;this.canvas.dataset.buffering='false';
    for(const node of this.nodes){try{node.stop();}catch{}node.disconnect();}this.nodes.clear();
    for(const item of this.buffers)item.scheduled=false;
    this.canvas.dataset.playing='false';this.callbacks.playing(false);this.publish(true);
  }
  isPlaying(){return this.running||this.pendingPlay;}
  setVolume(value:number){this.volume=value;this.updateGain();}
  setMuted(value:boolean){this.muted=value;this.updateGain();}
  private updateGain(){if(this.gain)this.gain.gain.value=this.muted?0:this.volume;}
  private clock(){return this.running?Math.min(this.total,this.videoThrough,this.audioThrough,Math.max(this.position,this.context.currentTime-this.epoch)):this.position;}
  private originalAt(time:number){
    for(const segment of this.segments)if(time<segment.editedEnd)return segment.start+Math.max(0,time-segment.editedStart);
    return this.segments.at(-1)?.end||0;
  }
  private publish(force=false){
    const time=this.clock();this.canvas.dataset.editedTime=String(time);
    const original=this.originalAt(time);this.canvas.dataset.originalTime=String(original);
    if(force||performance.now()-this.publishAt>60){this.callbacks.time(original);this.publishAt=performance.now();}
  }
  private reset(time:number){
    this.generation++;this.position=time;this.frames=[];this.displayed=undefined;this.buffers=[];this.videoThrough=time;this.audioThrough=this.audio?time:this.total;
    this.canvas.dataset.seeking='true';this.publish(true);
    for(const iterator of this.iterators)void iterator.return(undefined).catch(()=>{});this.iterators.clear();
    if(!this.total){this.canvas.getContext('2d')?.clearRect(0,0,this.canvas.width,this.canvas.height);this.canvas.dataset.seeking='false';this.publish(true);return;}
    const from=Math.min(time,Math.max(0,this.total-1/this.fps));
    const id=this.generation;
    void this.readVideo(from,id).catch(e=>this.fail(e,id));
    if(this.audio)void this.readAudio(from,id).catch(e=>this.fail(e,id));
  }
  private fail(error:unknown,id:number){if(id===this.generation&&!this.disposed){this.pause();this.generation++;this.callbacks.error(error);}}
  private holdIfNeeded(){
    const buffered=Math.min(this.videoThrough,this.audioThrough);
    if(!this.running||buffered>=this.total-.001||buffered-this.clock()>=.06)return false;
    this.pause();void this.play().catch(e=>this.fail(e,this.generation));return true;
  }
  private async space(at:number,id:number,video=false){
    while(id===this.generation&&!this.disposed&&(at>this.clock()+AHEAD||(video&&this.frames.length>=MAX_FRAMES)))await delay();
    return id===this.generation&&!this.disposed;
  }
  private async readVideo(from:number,id:number){
    const segments=this.segments,requests=previewFrames(segments,from,this.fps);
    let request=requests.next().value;if(!request)return;
    // Decode sequentially; resize only kept frames, without flushing on every cut/GOP.
    const iterator=this.video.samples(request.original,segments.at(-1)!.end);this.iterators.add(iterator);
    try{
      for await(const sample of iterator){
        try{
          if(id!==this.generation||this.disposed)return;
          while(request&&request.original<sample.timestamp+sample.duration-1e-7){
            if(!await this.space(request.at,id,true))return;
            const index=this.imageIndex++%192;
            const image=this.images[index]??(this.images[index]=new OffscreenCanvas(this.canvas.width,this.canvas.height));
            sample.draw(image.getContext('2d')!,0,0,image.width,image.height);
            this.holdIfNeeded();this.frames.push({...request,image});this.videoThrough=request.end;
            request=requests.next().value;
          }
          if(!request)break;
        }finally{sample.close();}
      }
      if(id===this.generation)this.videoThrough=this.total;
    }finally{this.iterators.delete(iterator);await iterator.return();}
  }
  private async readAudio(from:number,id:number){
    const segments=this.segments.filter(s=>s.editedEnd>from);if(!segments.length)return;
    const start=segments[0].start+Math.max(0,from-segments[0].editedStart);
    const iterator=this.audio!.buffers(start,segments.at(-1)!.end);this.iterators.add(iterator);
    let index=0;
    try{
      for await(const packet of iterator){
        if(id!==this.generation||this.disposed)return;
        while(index<segments.length&&segments[index].end<=packet.timestamp)index++;
        for(let i=index;i<segments.length&&segments[i].start<packet.timestamp+packet.duration;i++){
          const segment=segments[i];
          const slice=audioSlice(packet.timestamp,packet.duration,Math.max(start,segment.start),segment.end);if(!slice)continue;
          const at=segment.editedStart+slice.start-segment.start;
          if(!await this.space(at,id))return;
          this.holdIfNeeded();this.buffers.push({at,end:at+slice.duration,buffer:packet.buffer,offset:slice.offset,duration:slice.duration,scheduled:false});this.audioThrough=at+slice.duration;
          if(this.running)this.scheduleAudio();
        }
      }
      if(id===this.generation)this.audioThrough=this.total;
    }finally{this.iterators.delete(iterator);await iterator.return();}
  }
  private scheduleAudio(){
    if(!this.running)return;
    const now=this.context.currentTime;
    this.buffers=this.buffers.filter(item=>item.end>this.clock());
    for(const item of this.buffers){
      if(item.scheduled)continue;
      const skip=Math.max(0,this.position-item.at);
      const when=Math.round((this.epoch+item.at+skip)*this.context.sampleRate)/this.context.sampleRate;
      const late=Math.max(0,now-when);
      item.scheduled=true;if(skip+late>=item.duration)continue;
      const node=this.context.createBufferSource();node.buffer=item.buffer;node.connect(this.gain);
      node.start(Math.max(now,when),item.offset+skip+late,item.duration-skip-late);
      this.nodes.add(node);node.onended=()=>{this.nodes.delete(node);node.disconnect();};
    }
  }
  private loop=()=>{
    if(this.disposed)return;
    const time=this.clock();let frame:Frame|undefined;
    while(this.frames.length&&this.frames[0].at<=time)frame=this.frames.shift();
    if(frame){this.displayed=frame;this.canvas.dataset.presentedTime=String(frame.at);this.canvas.dataset.seeking='false';}
    if(this.displayed){
      // Transform on the displayed frame's clock, not between repeated decoded frames.
      const z=zoomAt(this.displayed.at,this.compiledZooms);
      if(this.lastDraw?.frame!==this.displayed||this.lastDraw.scale!==z.scale||this.lastDraw.x!==z.x||this.lastDraw.y!==z.y){
        const image=this.displayed.image,w=image.width/z.scale,h=image.height/z.scale;
        this.canvas.getContext('2d')!.drawImage(image,(image.width-w)*z.x,(image.height-h)*z.y,w,h,0,0,this.canvas.width,this.canvas.height);
        this.lastDraw={frame:this.displayed,...z};this.canvas.dataset.zoom=String(z.scale);
      }
    }
    this.canvas.dataset.bufferedUntil=String(Math.min(this.videoThrough,this.audioThrough));
    if(this.running){
      // Never let a late decoder advance the clock past audio that has not been played.
      if(!this.holdIfNeeded()){this.scheduleAudio();if(time>=this.total){this.pause();this.position=this.total;}this.publish();}
    }
    this.animation=requestAnimationFrame(this.loop);
  };
  dispose(){
    this.pause();this.disposed=true;this.generation++;cancelAnimationFrame(this.animation);
    for(const iterator of this.iterators)void iterator.return(undefined).catch(()=>{});this.iterators.clear();
    this.input.dispose();if(this.context)void this.context.close();
    this.frames=[];this.displayed=undefined;this.lastDraw=undefined;this.buffers=[];this.images=[];
  }
}
