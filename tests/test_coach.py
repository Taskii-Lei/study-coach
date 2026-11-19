import copy
import unittest
from datetime import date
import coach


class QueueTests(unittest.TestCase):
    def setUp(self):
        self.state = {'version': 1, 'days': {}, 'progress': {}, 'history': []}
        self.qs = [{'id': f'{track}-{i}', 'track': track} for track, _, _ in coach.TRACKS for i in range(3)]
        self.day = date(2026, 11, 19)

    def test_idempotent_and_three_tracks(self):
        first = coach.plan(self.state, self.qs, self.day)
        self.assertEqual(len(first), 3)
        self.assertIs(coach.plan(self.state, self.qs, self.day), first)

    def test_carry_without_adding_new_work(self):
        first = coach.plan(self.state, self.qs, self.day)
        later = coach.plan(self.state, self.qs, date(2026, 11, 20))
        self.assertEqual([t['id'] for t in first], [t['id'] for t in later])
        coach.assess(self.state, self.qs, first[0]['id'], 3, 'ok', date(2026, 11, 20), 'answer')
        self.assertTrue(first[0]['done'])
        self.assertTrue(later[0]['done'])

    def test_due_review_precedes_new_question(self):
        first = coach.plan(self.state, self.qs, self.day)
        coach.assess(self.state, self.qs, first[0]['id'], 3, 'ok', self.day, 'answer')
        later = coach.plan(self.state, self.qs, date(2026, 11, 20))
        self.assertEqual(first[0]['id'], later[0]['id'])
        self.assertTrue(later[0]['review'])

    def test_spacing_and_failed_review_reset(self):
        first = coach.plan(self.state, self.qs, self.day)
        qid = first[0]['id']
        coach.assess(self.state, self.qs, qid, 3, 'ok', self.day, 'answer')
        coach.plan(self.state, self.qs, date(2026, 11, 20))
        coach.assess(self.state, self.qs, qid, 4, 'ok', date(2026, 11, 20), 'answer')
        self.assertEqual(self.state['progress'][qid]['due'], '2026-11-23')
        coach.plan(self.state, self.qs, date(2026, 11, 23))
        coach.assess(self.state, self.qs, qid, 1, 'needs help', date(2026, 11, 23), 'answer')
        self.assertEqual(self.state['progress'][qid]['due'], '2026-11-24')
        self.assertEqual(self.state['progress'][qid]['stage'], 0)

    def test_duplicate_grade_does_not_mutate_progress(self):
        task = coach.plan(self.state, self.qs, self.day)[0]
        coach.assess(self.state, self.qs, task['id'], 3, 'ok', self.day, 'answer')
        original = copy.deepcopy(self.state)
        with self.assertRaises(ValueError):
            coach.assess(self.state, self.qs, task['id'], 4, 'ok', self.day, 'answer')
        self.assertEqual(self.state, original)

    def test_not_due_selects_new_question(self):
        task = coach.plan(self.state, self.qs, self.day)[0]
        self.state['progress'][task['id']] = {'due': '2026-12-01', 'score': 4}
        task['done'] = True
        later = coach.plan(self.state, self.qs, date(2026, 11, 20))
        self.assertNotEqual(task['id'], later[0]['id'])
        self.assertFalse(later[0]['review'])


if __name__ == '__main__':
    unittest.main()
