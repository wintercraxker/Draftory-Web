export const publicTeamRoles = {
  OWNER: {
    label: "Owner",
    rank: "owner",
    description: "Responsable de la administración y dirección de Draftory.",
  },
  ADMIN: {
    label: "Administrador",
    rank: "staff",
    description: "Administración de la plataforma y apoyo a la comunidad.",
  },
  MODERATOR: {
    label: "Moderador",
    rank: "staff",
    description: "Moderación y cuidado de una comunidad segura.",
  },
  HELPER: {
    label: "Helper",
    rank: "helper",
    description: "Orientación y asistencia a los jugadores de Draftory.",
  },
} as const;
export type PublicTeamRole = keyof typeof publicTeamRoles;
export type PublicTeamMember = {
  playerId?: string;
  name: string;
  role: PublicTeamRole;
  avatar: string | null;
  profileUrl: string | null;
};
export type PublicSponsorMember = Omit<PublicTeamMember, "role"> & {
  role: "SPONSOR";
};
export type PublicTeam = {
  owner: PublicTeamMember | null;
  staff: PublicTeamMember[];
  sponsors?: PublicSponsorMember[];
};
// Existing editorial community appointment. It is not a Draftory authorization
// or a verified Discord role; no account is inferred from a matching name.
export const communitySupervisor = {
  name: "Community Supervisor",
  role: "Supervisor",
  rank: "supervisor",
  description: "Supervisor de la comunidad.",
};
