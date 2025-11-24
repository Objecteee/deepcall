import { Card, Typography, Space, Empty } from 'antd';
import { useCallStore } from '@store/callStore';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

const { Text } = Typography;

// 自定义代码块渲染
const CodeBlock = ({ inline, className, children, ...props }: any) => {
  const match = /language-(\w+)/.exec(className || '');
  return !inline && match ? (
    <SyntaxHighlighter
      style={oneLight}
      language={match[1]}
      PreTag="div"
      customStyle={{ margin: '8px 0', borderRadius: '8px', fontSize: '13px' }}
      {...props}
    >
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code className={className} style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 4px', borderRadius: 4 }} {...props}>
      {children}
    </code>
  );
};

export default function SubtitlePanel() {
  const { subtitles } = useCallStore();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  // 自动滚动到底部（带防抖，只在消息完成时滚动）
  useEffect(() => {
    // 清除之前的定时器
    if (scrollTimeoutRef.current !== null) {
      window.clearTimeout(scrollTimeoutRef.current);
    }

    // 只有当最后一条消息完成时才滚动
    const lastSubtitle = subtitles[subtitles.length - 1];
    if (lastSubtitle?.isComplete) {
      scrollTimeoutRef.current = window.setTimeout(() => {
        const container = scrollContainerRef.current;
        if (container) {
          // 只滚动聊天容器本身，避免影响外层页面的滚动位置
          container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
          });
        }
      }, 100);
    }

    return () => {
      if (scrollTimeoutRef.current !== null) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [subtitles]);

  return (
    <Card 
      style={{ 
        borderRadius: 20,
        border: '1px solid rgba(0, 0, 0, 0.08)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        background: 'linear-gradient(to bottom, #fafbfc 0%, #f8f9fa 100%)',
        height: '100%',
        width: '100%'
      }}
      styles={{
        body: {
          height: '100%',
          padding: 0
        }
      }}
    >
      <div 
        ref={scrollContainerRef}
        className="chat-scroll"
        style={{ 
          height: '100%',
          padding: '28px 24px',
          overflowY: 'auto',
          background: 'transparent'
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
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            {subtitles.map((s, i) => (
              <div
                key={s.timestamp || `subtitle-${i}`}
                style={{ 
                  display: 'flex', 
                  flexDirection: 'column',
                  alignItems: s.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: 8,
                  animation: 'fadeIn 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <Text 
                  type="secondary" 
                  style={{ 
                    fontSize: 12, 
                    paddingLeft: s.role === 'user' ? 0 : 16,
                    paddingRight: s.role === 'user' ? 16 : 0,
                    fontWeight: 500,
                    color: s.role === 'user' ? '#667eea' : '#64748b',
                    letterSpacing: '0.3px'
                  }}
                >
                  {s.role === 'user' ? '我' : 'AI助手'}
                </Text>
                <div className={`bubble ${s.role === 'user' ? 'bubble-user' : 'bubble-assistant'} markdown-content`}>
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm]}
                    components={{ code: CodeBlock }}
                  >
                    {s.text || '...'}
                  </ReactMarkdown>
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


