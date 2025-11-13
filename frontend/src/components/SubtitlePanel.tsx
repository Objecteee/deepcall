import { Card } from 'antd';
import { useCallStore } from '@store/callStore';

export default function SubtitlePanel() {
  const { subtitles } = useCallStore();
  return (
    <Card size="small" className="glass-card" styles={{ body: { maxHeight: 340, overflow: 'auto' } }}>
      {subtitles.length === 0 ? (
        <div style={{ color: '#94a3b8' }}>等待语音...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {subtitles.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: s.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div className={`bubble ${s.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}>
                {s.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


