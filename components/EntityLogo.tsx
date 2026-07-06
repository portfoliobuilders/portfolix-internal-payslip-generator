'use client';

import type { EntityCode, EntityInfo } from '@/lib/types';
import { entityLogoSrc } from '@/lib/logos';

interface EntityLogoProps {
  entity: EntityInfo;
  code: EntityCode;
  alt?: string;
  className?: string;
}

export default function EntityLogo({ entity, code, alt, className = '' }: EntityLogoProps) {
  const label = alt ?? entity.name;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- data URLs and bundled SVGs
    <img
      src={entityLogoSrc(entity, code)}
      alt={label}
      className={`object-contain ${className}`}
      draggable={false}
    />
  );
}
