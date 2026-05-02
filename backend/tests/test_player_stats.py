"""Tests for _compute_player_stats and related helpers."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.routers.players import _compute_player_stats, _game_winner


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class FakeDoc:
    """Simulates a Firestore document snapshot."""
    def __init__(self, data: dict, doc_id: str = 'doc1'):
        self._data = data
        self.id = doc_id

    def to_dict(self):
        return self._data


def make_t_doc(name='T1', t_id='t1', date='2026-01-01', match_type='singles',
               teams=None, matches=None):
    teams = teams or [
        {'id': 'ta', 'name': 'A', 'type': 'singles', 'players': ['Alice']},
        {'id': 'tb', 'name': 'B', 'type': 'singles', 'players': ['Bob']},
    ]
    matches = matches or [
        {'id': 'm1', 'team1Id': 'ta', 'team2Id': 'tb', 'completed': True,
         'games': [{'team1Score': 11, 'team2Score': 5}]},
    ]
    return FakeDoc({
        'name': name, 'date': date, 'format': 'games', 'matchType': match_type,
        'levels': [{'id': 'l1', 'name': 'L1', 'groups': [
            {'id': 'g1', 'name': 'G1', 'teams': teams, 'matches': matches}
        ]}],
        'createdAt': 0,
    }, t_id)


def make_c_doc(team1: list[str], team2: list[str], winner: int, gtype='singles'):
    return FakeDoc({
        'team1': team1, 'team2': team2, 'winner': winner,
        'type': gtype, 'date': '2026-01-10', 'createdAt': 0,
        'games': [{'team1Score': 11 if winner == 1 else 5,
                   'team2Score': 5 if winner == 1 else 11}],
    })


# ---------------------------------------------------------------------------
# _game_winner
# ---------------------------------------------------------------------------

class TestGameWinner:
    def test_team1_wins(self):
        assert _game_winner(11, 5) == 'team1'

    def test_team2_wins(self):
        assert _game_winner(5, 11) == 'team2'

    def test_deuce_win(self):
        assert _game_winner(13, 11) == 'team1'

    def test_not_enough_lead(self):
        assert _game_winner(11, 10) is None

    def test_incomplete(self):
        assert _game_winner(9, 7) is None


# ---------------------------------------------------------------------------
# _compute_player_stats — basic counts
# ---------------------------------------------------------------------------

class TestComputePlayerStats:
    def test_tournament_match_win(self):
        stats = _compute_player_stats('Alice', [make_t_doc()], [])
        assert stats['overall']['matchesPlayed'] == 1
        assert stats['overall']['matchWins'] == 1
        assert stats['singles']['matchWins'] == 1

    def test_tournament_match_loss(self):
        stats = _compute_player_stats('Bob', [make_t_doc()], [])
        assert stats['overall']['matchesPlayed'] == 1
        assert stats['overall']['matchWins'] == 0

    def test_player_not_in_tournament(self):
        stats = _compute_player_stats('Charlie', [make_t_doc()], [])
        assert stats['overall']['matchesPlayed'] == 0
        assert stats['tournaments'] == []

    def test_tournament_appears_in_list(self):
        stats = _compute_player_stats('Alice', [make_t_doc('My Tourney', 't99')], [])
        assert len(stats['tournaments']) == 1
        assert stats['tournaments'][0]['name'] == 'My Tourney'

    def test_competitive_match_win(self):
        stats = _compute_player_stats('Alice', [], [make_c_doc(['Alice'], ['Bob'], winner=1)])
        assert stats['overall']['matchesPlayed'] == 1
        assert stats['overall']['matchWins'] == 1
        assert stats['singles']['matchWins'] == 1

    def test_competitive_match_loss(self):
        stats = _compute_player_stats('Alice', [], [make_c_doc(['Alice'], ['Bob'], winner=2)])
        assert stats['overall']['matchWins'] == 0

    def test_doubles_bucket(self):
        stats = _compute_player_stats('Alice', [], [make_c_doc(['Alice', 'X'], ['Bob', 'Y'], winner=1, gtype='doubles')])
        assert stats['doubles']['matchWins'] == 1
        assert stats['singles']['matchesPlayed'] == 0

    def test_points_for_and_against(self):
        stats = _compute_player_stats('Alice', [make_t_doc()], [])
        assert stats['singles']['pointsFor'] == 11
        assert stats['singles']['pointsAgainst'] == 5

    def test_game_wins(self):
        stats = _compute_player_stats('Alice', [make_t_doc()], [])
        assert stats['overall']['gameWins'] == 1
        assert stats['overall']['gameLosses'] == 0

    def test_multiple_tournaments(self):
        t1 = make_t_doc('T1', 't1')
        t2 = make_t_doc('T2', 't2')
        stats = _compute_player_stats('Alice', [t1, t2], [])
        assert stats['overall']['matchesPlayed'] == 2
        assert len(stats['tournaments']) == 2

    def test_combined_tournament_and_competitive(self):
        stats = _compute_player_stats('Alice', [make_t_doc()],
                                      [make_c_doc(['Alice'], ['Bob'], winner=1)])
        assert stats['overall']['matchesPlayed'] == 2
        assert stats['overall']['matchWins'] == 2

    def test_incomplete_match_not_counted(self):
        t_doc = make_t_doc(matches=[
            {'id': 'm1', 'team1Id': 'ta', 'team2Id': 'tb', 'completed': False,
             'games': [{'team1Score': 11, 'team2Score': 5}]},
        ])
        stats = _compute_player_stats('Alice', [t_doc], [])
        assert stats['overall']['matchesPlayed'] == 0

    def test_name_not_in_any_match(self):
        stats = _compute_player_stats('Zara', [make_t_doc()],
                                      [make_c_doc(['Alice'], ['Bob'], winner=1)])
        assert stats['overall']['matchesPlayed'] == 0
