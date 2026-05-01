from pydantic import BaseModel, ConfigDict, Field
from typing import Optional


class Game(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    team1Score: int = Field(alias='team1Score', default=0)
    team2Score: int = Field(alias='team2Score', default=0)


class Match(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    team1Id: str
    team2Id: str
    games: list[Game] = []
    completed: bool = False


class Team(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    type: str = 'singles'
    players: list[str] = []


class Group(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    teams: list[Team] = []
    matches: list[Match] = []


class TournamentLevel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    groups: list[Group] = []
    setCount: Optional[int] = None


class Tournament(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    name: str
    format: str  # 'sets' | 'games'
    setCount: Optional[int] = None
    matchType: Optional[str] = None
    levels: list[TournamentLevel] = []
    createdAt: int
    date: Optional[str] = None


class PlayerRanking(BaseModel):
    name: str
    points: int = 0
    participationPts: int = 0
    gameWinPts: int = 0
    bonusPts: int = 0
    gameWins: int = 0
    matchesPlayed: int = 0


class RatingGame(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    type: str  # 'singles' | 'doubles'
    team1: list[str] = []
    team2: list[str] = []
    games: list[Game] = []
    winner: int  # 1 | 2
    setCount: int = 3
    date: str = ''
    createdAt: int = 0


class PlayerRatingEntry(BaseModel):
    name: str
    rating: float
    uncertainty: float
    volatility: Optional[float] = None
    won: int = 0
    lost: int = 0
    gamesPlayed: int = 0
    algo: str = 'rc'
    type: str = 'singles'
