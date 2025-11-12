import { Card, Typography } from 'antd';
import { useCallStore } from '@store/callStore';

const { Paragraph } = Typography;

export default function SubtitlePanel() {
  const { subtitles } = useCallStore();
  return (
    <Card size="small" style={{ maxHeight: 280, overflow: 'auto' }}>
      {subtitles.length === 0 ? (
        <Paragraph type="secondary">等待语音...</Paragraph>
      ) : (
        subtitles.map((s, i) => (
          <Paragraph key={i} style={{ marginBottom: 8 }}>
            <strong>{s.role === 'user' ? '你' : 'AI'}：</strong> {s.text}
          </Paragraph>
        ))
      )}
    </Card>
  );
}


