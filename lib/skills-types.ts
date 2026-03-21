export type SkillLocation = 'hub' | 'agent' | 'project';

export interface Skill {
    id: string;
    name: string;
    description: string;
    path: string;
    location: SkillLocation;
    agentName?: string; // Was platform
    projectName?: string;
    projectPath?: string;
    enabled?: boolean;
    sourcePackageId?: string;
    sourcePackageName?: string;
    sourceKitId?: string;
    sourceKitName?: string;
}

// Deprecated: PLATFORM_NAMES and PLATFORM_LOCAL_PATHS are now dynamic in AppConfig
