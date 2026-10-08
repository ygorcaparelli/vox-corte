import unittest
from core import merge_cuts, kept_intervals, export_filter, concat_manifest


class CutsTest(unittest.TestCase):
    def test_manifest_limits_and_path_escaping(self):
        text = concat_manifest("teste d'agua.mp4", [(0, 1.25), (2.5, 4)])
        self.assertTrue(text.startswith('ffconcat version 1.0\n'))
        self.assertIn("d'\\''agua.mp4'", text)
        self.assertIn('inpoint 2.500000\noutpoint 4.000000\nduration 1.500000', text)
        self.assertNotIn('split=', text)
    def test_overlapping_and_outside_cuts(self):
        cuts = [{'start': -2, 'end': 1}, {'start': .5, 'end': 2}, {'start': 4, 'end': 20}]
        self.assertEqual(merge_cuts(cuts, 8), [{'start': 0, 'end': 2}, {'start': 4, 'end': 8}])
        self.assertEqual(kept_intervals(cuts, 8), [(2, 4)])

    def test_full_deletion_and_empty_edit(self):
        self.assertEqual(kept_intervals([{'start': 0, 'end': 8}], 8), [])
        self.assertEqual(kept_intervals([], 8), [(0, 8)])

    def test_audio_video_identical_boundaries(self):
        graph = export_filter([(0, 1.25), (2.5, 4)])
        self.assertIn('trim=start=2.500000:end=4.000000', graph)
        self.assertIn('atrim=start=2.500000:end=4.000000', graph)
        self.assertIn('[v0][a0][v1][a1]concat=n=2:v=1:a=1', graph)

    def test_video_without_audio(self):
        graph = export_filter([(0, 2)], False)
        self.assertNotIn('atrim', graph)
        self.assertIn('concat=n=1:v=1:a=0', graph)

    def test_preview_scales_before_splitting_and_preserves_cut_bounds(self):
        graph = export_filter([(0, 1.25), (2.5, 4)], preview=True)
        self.assertTrue(graph.startswith('[0:v:0]scale='))
        self.assertIn('fps=30,split=2[source0][source1]', graph)
        self.assertIn('[source1]trim=start=2.500000:end=4.000000', graph)
        self.assertIn('atrim=start=2.500000:end=4.000000', graph)
        self.assertNotIn('scale=', export_filter([(0, 1.25), (2.5, 4)]))


if __name__ == '__main__':
    unittest.main()
