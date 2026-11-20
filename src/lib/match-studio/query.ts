import { stratzMatchQuery } from "../dota-stats/match-providers";
// Verified by authenticated introspection on 2026-10-11; no change to competitive analytics contracts.
export const studioQuery = stratzMatchQuery
  .replace(
    "didRadiantWin players",
    "didRadiantWin gameVersionId playbackData { wardEvents { indexId time positionX positionY fromPlayer wardType action playerDestroyed } } radiantTeam { name } direTeam { name } radiantNetworthLeads radiantExperienceLeads players",
  )
  .replace(
    "neutral0Id }",
    "neutral0Id hero { gameVersionId talents { abilityId slot } } steamAccount { name } abilities { abilityId abilityType { name uri language { displayName } } } playbackData { playerUpdateGoldEvents { time networth } abilityLearnEvents { time abilityId levelObtained level isTalent } } stats { networthPerMinute killEvents { time target } wards { time type positionX positionY } wardDestruction { isWard } } }",
  );
export const studioTalentQuery =
  "query StudioTalentNames($version:Short!) { constants { abilities(gameVersionId:$version) { id language { displayName } } } }";
