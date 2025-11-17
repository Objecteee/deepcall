import { Card, Typography, Space, Empty } from 'antd';
import { useCallStore } from '@store/callStore';
import { useEffect, useRef } from 'react';

const { Text } = Typography;

export default function SubtitlePanel() {
  const { subtitles } = useCallStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Debug: 打印subtitles变化
  useEffect(() => {
    console.log('🔄 SubtitlePanel subtitles更新:', subtitles.length, subtitles);
  }, [subtitles]);

  // 自动滚动到底部
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [subtitles]);

  return (
    <Card 
      style={{ 
        borderRadius: 16,
        border: '1px solid rgba(0, 0, 0, 0.06)',
        boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
        background: '#fff',
        height: '100%'
      }}
      styles={{ 
        body: { 
          height: '100%',
          minHeight: 500,
          maxHeight: 600,
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        } 
      }}
    >
      <div 
        ref={scrollContainerRef}
        className="chat-scroll"
        style={{ 
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: 24,
        }}
      >
        {subtitles.length === 0 ? (
          <Empty 
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span style={{ color: '#94a3b8', fontSize: 14 }}>
                开始对话，实时记录将显示在这里...
              </span>
            }
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              paddingTop: 60
            }}
          />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {subtitles.map((s, i) => (
              <div
                key={`${i}-${s.timestamp}`}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: s.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 6,
                  animation: 'fadeIn 0.3s ease-in',
                }}
              >
                <Text 
                  type="secondary" 
                  style={{ 
                    fontSize: 12, 
                    paddingLeft: s.role === 'user' ? 0 : 12,
                    paddingRight: s.role === 'user' ? 12 : 0,
                    fontWeight: 500
                  }}
                >
                  {s.role === 'user' ? '我' : 'AI助手'}
                </Text>
                <div className={`bubble ${s.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}>
                  {s.text || '...'}
                  {!s.isComplete && (
                    <span className="typing-indicator">▊</span>
                  )}
                </div>
              </div>
            ))}
            {/* 滚动锚点 */}
            <div ref={bottomRef} style={{ height: 1 }} />
          </Space>
        )}
      </div>
    </Card>
  );
}


