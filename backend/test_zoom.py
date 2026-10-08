import unittest
from zoom import compile_zooms, zoom_filter


class ZoomTests(unittest.TestCase):
    def setUp(self):
        self.z = {'start': 0, 'end': 4, 'from': 1, 'to': 2, 'x': .5, 'y': .5, 'curve': 'smooth'}

    def test_cuts_keep_zoom_timing(self):
        z = compile_zooms([self.z], [(0, 1), (3, 5)], 5)
        self.assertEqual(z[0]['end'], 2)
        graph = zoom_filter(z, 640, 360, 30)
        self.assertIn('(on-1)/30.', graph)
        self.assertIn('perspective=', graph)
        self.assertNotIn('zoompan', graph)

    def test_automatic_transition_preserved(self):
        z = compile_zooms([{**self.z, 'automatic': True}], [(0, 4)], 4)
        self.assertTrue(z[0]['automatic'])
        self.assertIn('0.35000000', zoom_filter(z, 640, 360, 30))

    def test_sparse_automatic_motion_has_no_fast_edge_ramp(self):
        z = compile_zooms([{**self.z, 'automatic': True, 'automaticMotion': 'cut-out', 'from':1.18, 'to':1}], [(0,4)], 4)
        self.assertEqual(z[0]['automaticMotion'], 'cut-out')
        self.assertNotIn('0.35000000', zoom_filter(z,640,360,30))
        with self.assertRaises(ValueError):
            compile_zooms([{**self.z, 'automaticMotion':'unknown'}], [(0,4)],4)

    def test_removed_zoom_and_invalid_values(self):
        self.assertEqual(compile_zooms([self.z], [(4, 5)], 5), [])
        for value in (float('nan'), 0, 4):
            with self.assertRaises(ValueError):
                compile_zooms([{**self.z, 'to': value}], [(0, 5)], 5)
        with self.assertRaises(ValueError):
            compile_zooms([self.z, self.z], [(0, 5)], 5)


if __name__ == '__main__':
    unittest.main()
