import React, { useState } from 'react';
import { getClubCrestUrl } from '../data/nations';

interface ClubCrestProps {
  clubId: string;
  clubName: string;
  shortName?: string;
  primaryColor?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  xs: 'w-5 h-5 text-[9px]',
  sm: 'w-7 h-7 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-12 h-12 text-sm',
  xl: 'w-16 h-16 text-base',
};

export const ClubCrest: React.FC<ClubCrestProps> = ({
  clubId,
  clubName,
  shortName,
  primaryColor = '#10B981',
  size = 'md',
  className = '',
}) => {
  const [attempt, setAttempt] = useState<'default' | 'underscore' | 'clean' | 'fallback'>('default');

  const handleError = () => {
    if (attempt === 'default') setAttempt('underscore');
    else if (attempt === 'underscore') setAttempt('clean');
    else setAttempt('fallback');
  };

  if (attempt === 'fallback' || !clubId) {
    const abbr = (shortName || clubName.slice(0, 3)).toUpperCase().slice(0, 3);
    return (
      <div
        title={clubName}
        className={`${SIZE_MAP[size]} ${className} inline-flex items-center justify-center shrink-0 rounded-md border border-zinc-700/80 font-mono font-bold tracking-tight text-white select-none`}
        style={{
          background: `linear-gradient(145deg, ${primaryColor}55, #18181b 85%)`,
        }}
      >
        {abbr}
      </div>
    );
  }

  return (
    <img
      src={getClubCrestUrl(clubId, attempt)}
      alt={clubName}
      title={clubName}
      referrerPolicy="no-referrer"
      onError={handleError}
      className={`${SIZE_MAP[size]} ${className} object-contain shrink-0 select-none`}
    />
  );
};
