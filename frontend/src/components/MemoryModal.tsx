import React from 'react';
import { Modal, Space, Typography, Input, Flex, Popconfirm, Button } from 'antd';

const { Text } = Typography;

interface MemoryModalProps {
  open: boolean;
  content: string;
  onChange: (val: string) => void;
  onSave: () => void;
  onCancel: () => void;
  onClear: () => void;
}

export default function MemoryModal({ 
  open, 
  content, 
  onChange, 
  onSave, 
  onCancel, 
  onClear 
}: MemoryModalProps) {
  return (
    <Modal
      title="编辑 AI 记忆"
      open={open}
      onOk={onSave}
      onCancel={onCancel}
      okText="保存"
      cancelText="取消"
    >
      <Space direction="vertical" style={{ width: '100%', paddingTop: 16 }}>
        <Text type="secondary">
          这是 AI 目前记住的关于您的信息摘要。您可以手动修改以纠正错误或补充信息。
        </Text>
        <Input.TextArea
          rows={6}
          value={content}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          placeholder="暂无记忆..."
        />
        <Flex justify="flex-end">
          <Popconfirm
            title="清除记忆"
            description="确定要彻底清除所有长期记忆吗？此操作不可恢复。"
            onConfirm={onClear}
            okText="确定清除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button danger type="link">清除所有记忆</Button>
          </Popconfirm>
        </Flex>
      </Space>
    </Modal>
  );
}

