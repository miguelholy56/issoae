import React, { useState } from 'react';
import { getNationCode, getNationFlagUrl } from '../data/nations';

interface NationFlagProps {
  nationality: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES = {
  xs: 'w-4 h-3 text-[8px]',
  sm: 'w-6 h-4.5 text-[9px]',
  md: 'w-8 h-6 text-[10px]',
  lg: 'w-11 h-8 text-xs',
};

export const NationFlag: React.FC<NationFlagProps> = ({
  nationality,
  size = 'sm',
  className = '',
}) => {
  const [failed, setFailed] = useState(false);
  const code = getNationCode(nationality);

  if (failed || code === 'un') {
    return (
      <span
        title={nationality}
        className={`${SIZE_CLASSES[size]} ${className} inline-flex items-center justify-center shrink-0 rounded-[3px] bg-zinc-800 border border-zinc-700 font-mono uppercase text-zinc-300 select-none`}
      >
        {code.slice(0, 2)}
      </span>
    );
  }

  return (
    <img
      src={getNationFlagUrl(nationality)}
      alt={nationality}
      title={nationality}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${SIZE_CLASSES[size]} ${className} object-cover shrink-0 rounded-[3px] border border-zinc-800 select-none`}
    />
  );
};
