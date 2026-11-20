import base64
import json
import unittest

import coach_feedback as feedback


class CoachFeedbackTests(unittest.TestCase):
    def setUp(self):
        self.value = dict(kind='xunxu-coach-feedback', version=1,
                          requestId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', questionId='qa-01',
                          submittedAt='2026-11-20T01:00:00.000Z', judgedAt='2026-11-20T02:00:00.000Z',
                          score=2, verdict='partial', feedback='需要区分方差与标准差。', nextStep='明天重做推导。',
                          verification=dict(mode='discussion', detail='已核对点积方差与假设。'))

    def test_build_link_is_fragment_only_and_preserves_chinese(self):
        link = feedback.build_link(self.value)
        self.assertTrue(link.startswith(feedback.BASE))
        encoded = link.split('#coach-feedback=')[1]
        value = json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4)))
        self.assertEqual(value, self.value)

    def test_rejects_bad_score_and_dates(self):
        for patch in [dict(score=True), dict(score=5), dict(submittedAt='2026-02-30T01:00:00Z'),
                      dict(requestId='bad'), dict(verdict='accepted'), dict(verification=dict(mode='ran', detail='incorrect type'))]:
            with self.subTest(patch=patch), self.assertRaises(ValueError):
                feedback.build_link({**self.value, **patch})


if __name__ == '__main__':
    unittest.main()
