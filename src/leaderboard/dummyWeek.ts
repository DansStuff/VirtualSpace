import { type MissionRecord } from '../players/contributions'

/** Pre-sorted top 5: furthest encounter, then total damage. */
export const DUMMY_WEEKLY_MISSIONS: MissionRecord[] = [
  {
    won: true,
    furthestEncounter: 'encounter-7',
    contributions: [
      { playerId: '0x1111111111111111111111111111111111111111', damage: 420, repairs: 4 },
      { playerId: '0x2222222222222222222222222222222222222222', damage: 310, repairs: 2 },
      { playerId: '0x3333333333333333333333333333333333333333', damage: 185, repairs: 6 }
    ]
  },
  {
    won: true,
    furthestEncounter: 'encounter-6',
    contributions: [
      { playerId: '0x4444444444444444444444444444444444444444', damage: 360, repairs: 3 },
      { playerId: '0x5555555555555555555555555555555555555555', damage: 240, repairs: 5 }
    ]
  },
  {
    won: false,
    furthestEncounter: 'encounter-5',
    contributions: [
      { playerId: '0x6666666666666666666666666666666666666666', damage: 290, repairs: 1 },
      { playerId: '0x7777777777777777777777777777777777777777', damage: 175, repairs: 4 },
      { playerId: '0x8888888888888888888888888888888888888888', damage: 90, repairs: 2 }
    ]
  },
  {
    won: true,
    furthestEncounter: 'encounter-4',
    contributions: [
      { playerId: '0x9999999999999999999999999999999999999999', damage: 210, repairs: 3 },
      { playerId: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', damage: 150, repairs: 1 }
    ]
  },
  {
    won: false,
    furthestEncounter: 'encounter-3',
    contributions: [
      { playerId: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', damage: 80, repairs: 2 },
      { playerId: '0xcccccccccccccccccccccccccccccccccccccccc', damage: 55, repairs: 0 }
    ]
  }
]
