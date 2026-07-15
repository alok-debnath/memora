import React from "react";

import { AppMenuButton } from "@/components/navigation/AppNavigationMenu";
import { PageHero } from "@/components/ui/PageHero";

type PrimaryPageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

/** Stable header composition shared by every primary tab destination. */
export function PrimaryPageHeader({ eyebrow, title, description }: PrimaryPageHeaderProps) {
  return (
    <PageHero
      eyebrow={eyebrow}
      title={title}
      description={description}
      action={<AppMenuButton />}
    />
  );
}
