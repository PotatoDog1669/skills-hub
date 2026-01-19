'use client';

import { Skill } from '@/lib/skills-types';
import { AppConfig } from '@/lib/config';
import { SkillCard, UnifiedSkill, ViewContext } from './SkillCard';
import { SyncModal } from './SyncModal';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface DashboardProps {
    skills: Skill[];
    config: AppConfig;
}

export function Dashboard({ skills, config }: DashboardProps) {
    const searchParams = useSearchParams();
    const currentView = searchParams.get('view') || 'all';
    const currentId = searchParams.get('id');

    const viewContext: ViewContext = { view: currentView, id: currentId };

    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // 1. Group ALL skills first.
    const allGroups: Record<string, UnifiedSkill> = {};
    skills.forEach(skill => {
        if (!allGroups[skill.name]) {
            allGroups[skill.name] = {
                name: skill.name,
                description: skill.description,
                instances: []
            };
        }
        if (skill.description && skill.description.length > allGroups[skill.name].description.length) {
            allGroups[skill.name].description = skill.description;
        }
        allGroups[skill.name].instances.push(skill);
    });

    // 2. Filter Groups based on View
    const filteredGroups = Object.values(allGroups).filter(group => {
        if (currentView === 'all') return true;

        if (currentView === 'hub') {
            return group.instances.some(s => s.location === 'hub');
        }
        if (currentView === 'agent') {
            return group.instances.some(s => s.agentName === currentId);
        }
        if (currentView === 'project') {
            return group.instances.some(s => s.path.startsWith(currentId || ''));
        }
        return true;
    });


    const handleSync = (skill: Skill) => {
        setSelectedSkill(skill);
        setIsModalOpen(true);
    };

    const title =
        currentView === 'all' ? 'All Skills' :
            currentView === 'hub' ? 'Central Skills Hub' :
                currentView === 'agent' ? `${currentId} Skills` :
                    `Project Skills`;

    return (
        <div className="container py-8">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">{title}</h1>
                <span className="text-muted-foreground">{filteredGroups.length} skills found</span>
            </div>

            {filteredGroups.length === 0 ? (
                <div className="text-center py-20 bg-muted/30 rounded-lg border border-dashed">
                    <p className="text-muted-foreground">No skills found in this view.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredGroups.map(group => (
                        <SkillCard key={group.name} unifiedSkill={group} onSync={handleSync} viewContext={viewContext} />
                    ))}
                </div>
            )}

            {selectedSkill && (
                <SyncModal
                    skill={selectedSkill}
                    config={config}
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
}
