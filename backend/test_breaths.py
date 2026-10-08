import unittest
import numpy as np
from breaths import breath_candidates, dry_cuts, speech_intervals


class BreathTest(unittest.TestCase):
    def test_optional_protection_keeps_word_and_speech_edges(self):
        speech=[{'start':0,'end':1},{'start':2,'end':3}]
        cuts=dry_cuts(speech,[{'start':.5,'end':1.1}],3,protect=True)
        self.assertAlmostEqual(cuts[0]['start'],1.4)
        self.assertAlmostEqual(cuts[0]['end'],1.82)
        self.assertEqual(dry_cuts([{'start':0,'end':1},{'start':1.15,'end':2}],[],2,protect=True),[])
    def test_short_hesitations_and_word_suffixes_are_not_cut(self):
        self.assertEqual(dry_cuts([{'start':0,'end':1},{'start':1.6,'end':3}],[],3,protect=True),[])
        words=[{'start':.8,'end':1.45}]
        cuts=dry_cuts([{'start':0,'end':1},{'start':3,'end':4}],words,4,protect=True)
        self.assertAlmostEqual(cuts[0]['start'],1.75)
        self.assertAlmostEqual(cuts[0]['end'],2.82)
        self.assertTrue(cuts[0]['automatic'])

    def test_chunk_context_does_not_drop_speech_at_30_seconds(self):
        audio=np.arange(62*100)
        def detector(part, options):
            # Simulate uncertain VAD edges at the start/end of each input.
            a,b=max(int(part[0])+20,2900),min(int(part[-1])-20,3100)
            return [{'start':a-int(part[0]),'end':b-int(part[0])}] if b>a else []
        result=speech_intervals(audio,detector,None,rate=100,context_seconds=1)
        self.assertEqual(result,[{'start':29,'end':31}])
    def test_default_detection_uses_original_nonoverlapping_windows(self):
        sizes=[]
        speech_intervals(np.zeros(65*100),lambda part,options: sizes.append(len(part)) or [],None,rate=100)
        self.assertEqual(sizes,[3000,3000,500])
    def test_dry_cuts_have_no_padding_and_do_not_erase_unknown_audio(self):
        cuts=dry_cuts([{'start':0,'end':1},{'start':2,'end':3}],[],3)
        self.assertEqual([(c['start'],c['end']) for c in cuts],[(1,2)])
        self.assertEqual(dry_cuts([{'start':0,'end':1}], [{'start':1,'end':2}],2),[])
        with self.assertRaises(ValueError):
            dry_cuts([],[],3)
    def test_silence_and_tone_are_not_candidates(self):
        silence = np.zeros(16000, dtype=np.float32)
        tone = (.2 * np.sin(2*np.pi*440*np.arange(16000)/16000)).astype(np.float32)
        self.assertEqual(breath_candidates(silence, [], []), [])
        self.assertEqual(breath_candidates(tone, [], []), [])

    def test_noise_between_words_is_revisable_and_protects_speech(self):
        audio = np.zeros(3*16000, dtype=np.float32)
        audio[19200:27200] = np.random.default_rng(42).normal(0,.03,8000)
        words = [{'start':0,'end':1},{'start':2,'end':3}]
        candidates = breath_candidates(audio, [], words)
        self.assertEqual(len(candidates), 1)
        self.assertGreaterEqual(candidates[0]['start'], 1.08)
        self.assertLessEqual(candidates[0]['end'], 1.92)
        self.assertEqual(breath_candidates(audio, [{'start':1,'end':2}], words), [])
        self.assertEqual(breath_candidates(audio, [], [{'start':0,'end':3}]), [])


if __name__ == '__main__':
    unittest.main()
