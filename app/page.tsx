import { getAllSkills } from "@/lib/skills-server";
import { getConfig } from "@/lib/config";
import { Dashboard } from "@/components/Dashboard";

export const dynamic = 'force-dynamic';

import { Suspense } from "react";

export default async function Home() {
  const skills = await getAllSkills();
  const config = await getConfig();

  return (
    <Suspense fallback={<div>Loading skills...</div>}>
      <Dashboard skills={skills} config={config} />
    </Suspense>
  );
}
