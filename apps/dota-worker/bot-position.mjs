// Coach is confirmed only by a serialized coach_team AND a non-player team.
// Never infer it from SetCoach SUBMITTED, an empty slot, or absence of the bot.
export function botNonPlaying(member) {
  return (
    !!member &&
    (member.heroId == null ||
      (Number.isInteger(member.heroId) && member.heroId <= 0)) &&
    (member.teamCode === 3 ||
      (member.teamCode === 4 && [0, 1].includes(member.coachTeamCode)))
  );
}

export function humanPlayer(member) {
  return (
    !!member &&
    [0, 1].includes(member.teamCode) &&
    (member.coachTeamCode == null || member.coachTeamCode === 5)
  );
}

export function observedBotPosition(member) {
  if (!member) return "UNOBSERVED";
  if (!botNonPlaying(member))
    return [0, 1].includes(member.teamCode) ||
      (Number.isInteger(member.heroId) && member.heroId > 0)
      ? "BOT_PLAYING"
      : "UNVERIFIED";
  if ([0, 1].includes(member.coachTeamCode))
    return member.coachTeamCode === 0 ? "COACH_RADIANT" : "COACH_DIRE";
  return "SPECTATOR";
}
