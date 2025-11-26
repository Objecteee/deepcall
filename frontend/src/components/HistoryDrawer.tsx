import React, { useState } from 'react';
import { Drawer, List, Button, Popconfirm, Space, Typography, Badge, Empty, Modal } from 'antd';
import { Subtitle } from '@store/callStore';

const { Text } = Typography;

export type HistoryItem = {
  id: string;
  date: number;
  subtitles: Subtitle[];
};

interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  historyList: HistoryItem[];
  onDelete: (id: string) => void;
}

export default function HistoryDrawer({ open, onClose, historyList, onDelete }: HistoryDrawerProps) {
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  return (
    <>
      <Drawer
        title="对话历史"
        placement="right"
        width={600}
        open={open}
        onClose={onClose}
      >
        {historyList.length === 0 ? (
          <Empty description="暂无历史记录" />
        ) : (
          <List
            dataSource={historyList}
            renderItem={(item: HistoryItem) => (
              <List.Item
                actions={[
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setSelectedHistory(item)}
                  >
                    查看详情
                  </Button>,
                  <Popconfirm
                    title="删除记录"
                    description="确定要删除这条历史记录吗？"
                    onConfirm={() => onDelete(item.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button type="link" danger size="small">
                      删除
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>
                        {new Date(item.date).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                      <Badge count={item.subtitles.length} showZero />
                    </Space>
                  }
                  description={
                    <Text type="secondary" ellipsis>
                      {item.subtitles.slice(0, 2).map((s: Subtitle, i: number) => (
                        <span key={i}>
                          {s.role === 'user' ? '我' : 'AI'}: {s.text}
                          {i < 1 && ' | '}
                        </span>
                      ))}
                      {item.subtitles.length > 2 && '...'}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>

      {/* 历史记录详情弹窗 */}
      <Modal
        title={`对话详情 - ${selectedHistory ? new Date(selectedHistory.date).toLocaleString('zh-CN') : ''}`}
        open={!!selectedHistory}
        onCancel={() => setSelectedHistory(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedHistory(null)}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {selectedHistory && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 0' }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {selectedHistory.subtitles.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: s.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 6
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.role === 'user' ? '我' : 'AI助手'}
                  </Text>
                  <div
                    className={`bubble ${s.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}
                    style={{ maxWidth: '80%' }}
                  >
                    {s.text}
                  </div>
                </div>
              ))}
            </Space>
          </div>
        )}
      </Modal>
    </>
  );
}

