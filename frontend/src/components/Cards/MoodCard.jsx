import React from 'react';
import { MdPlayArrow } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';

export default function MoodCard({ mood }) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/mood/${encodeURIComponent(mood.query)}`);
  };

  return (
    <div
      className="relative rounded-lg overflow-hidden cursor-pointer group h-20 flex items-center px-4"
      style={{ backgroundColor: mood.color + '33', borderLeft: `4px solid ${mood.color}` }}
      onClick={handleClick}
    >
      <div>
        <p className="text-white font-bold text-sm">{mood.label}</p>
        <p className="text-sp-muted text-xs mt-0.5 truncate max-w-32">{mood.query.slice(0, 35)}...</p>
      </div>
      <button
        className="absolute right-3 bottom-3 w-8 h-8 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all translate-y-1 group-hover:translate-y-0 shadow-lg"
        style={{ backgroundColor: mood.color }}
      >
        <MdPlayArrow size={18} className="text-white" />
      </button>
    </div>
  );
}
