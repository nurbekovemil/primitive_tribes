import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { useGame } from './GameScreen';

export function EventLog() {
  const game = useGame();
  const logs = useStore((s) => s.logs);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [logs]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && document.activeElement !== input.current) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="panel log">
      <div className="lines" ref={list}>
        {logs.map((l) => (
          <div key={l.id} className={`line ${l.tone}`}>
            {l.name && <b style={{ color: l.color }}>{l.name}: </b>}
            {l.text}
          </div>
        ))}
      </div>
      <input
        ref={input}
        maxLength={140}
        value={text}
        placeholder="Enter — написать всем племенам…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            if (text.trim()) game.session.room.send('chat', text.trim());
            setText('');
            input.current?.blur();
          } else if (e.key === 'Escape') input.current?.blur();
        }}
      />
    </div>
  );
}
