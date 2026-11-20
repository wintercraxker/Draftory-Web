// Draftory configuration, adjustable independently of UI. MMR boundaries are
// initial project settings, not an automatic verification of a Dota account.
export const competitiveConfig = {
  initialElo: 5000,
  eloK: 56, // Equal teams: 56 × (1 - 0.5) = +28; losing = -28.
  eloScale: 400,
  xpPerMatch: 100,
  xpWinBonus: 50,
  xpBase: 200,
  xpPerLevel: 50,
  balanceWarningMmr: 500,
};

export const medals = [
  { name: "Heraldo", min: 0, image: "/m_heraldo.webp" },
  { name: "Guardian", min: 770, image: "/m_guardian.webp" },
  { name: "Cruzado", min: 1540, image: "/m_cruzado.webp" },
  { name: "Arconte", min: 2310, image: "/m_arconte.webp" },
  { name: "Leyenda", min: 3080, image: "/m_leyenda.webp" },
  { name: "Ancient", min: 3850, image: "/m_ancient.webp" },
  { name: "Divine", min: 4620, image: "/m_divine.webp" },
  {
    name: "Inmortal",
    variant: "immortal",
    min: 5620,
    image: "/m_inmortal.webp",
  },
  {
    name: "Inmortal",
    variant: "immortal_100",
    min: 7000,
    image: "/m_imortal100.webp",
  },
  {
    name: "Inmortal",
    variant: "immortal_10",
    min: 7700,
    image: "/m_inmortal10.png",
  },
] as const;

// Leaderboard position is independent metadata. The current product uses the
// explicitly configured MMR tiers above for its medal, including 100 and 10.
export const leaderboardMedals: {
  name: string;
  maxPosition: number | null;
  image: string;
}[] = [
  { name: "Immortal Top 10", maxPosition: 10, image: "/m_inmortal10.png" },
  { name: "Immortal Top 100", maxPosition: 100, image: "/m_imortal100.webp" },
];
