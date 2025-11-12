import { useState, useMemo } from 'react';
import { Button, Card, Flex, Typography, Space, Badge } from 'antd';
import { PhoneFilled } from '@ant-design/icons';
import { motion } from 'framer-motion';
import CallButton from '@components/CallButton';
import SubtitlePanel from '@components/SubtitlePanel';
import ControlBar from '@components/ControlBar';
import DeviceSelector from '@components/DeviceSelector';
import AudioVisualizer from '@components/AudioVisualizer';
import { useCallStore } from '@store/callStore';

const { Title, Text } = Typography;

export default function App() {
  const { status, setStatus } = useCallStore();
  const [latencyMs] = useState<number | null>(null);

  const statusInfo = useMemo(() => {
    switch (status) {
      case 'idle':
        return { text: '就绪', color: 'default' as const };
      case 'connecting':
        return { text: '连接中', color: 'processing' as const };
      case 'listening':
        return { text: 'Listening', color: 'success' as const };
      case 'thinking':
        return { text: 'Thinking', color: 'warning' as const };
      case 'speaking':
        return { text: 'Speaking', color: 'error' as const };
      case 'ended':
        return { text: '已结束', color: 'default' as const };
    }
  }, [status]);

  return (
    <Flex vertical align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      <Space direction="vertical" align="center" size={16} style={{ width: '100%', maxWidth: 960 }}>
        <Flex align="center" justify="space-between" style={{ width: '100%' }}>
          <Title level={3} style={{ margin: 0 }}>DeepCall</Title>
          <Space>
            <Badge status={statusInfo.color} text={statusInfo.text} />
            <Text type="secondary">{latencyMs ? `${latencyMs} ms` : ''}</Text>
            <DeviceSelector />
          </Space>
        </Flex>

        <Card style={{ width: '100%' }} bodyStyle={{ padding: 24 }}>
          <Flex align="center" justify="center" vertical>
            {status === 'idle' || status === 'ended' ? (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <CallButton
                  onStart={() => setStatus('connecting')}
                  icon={<PhoneFilled />}
                  label="开始通话"
                />
              </motion.div>
            ) : (
              <Flex vertical gap={16} style={{ width: '100%' }}>
                <AudioVisualizer />
                <SubtitlePanel />
                <ControlBar />
              </Flex>
            )}
          </Flex>
        </Card>

        <Space>
          <Button type="link">历史记录</Button>
          <Button type="link">设置</Button>
        </Space>
      </Space>
    </Flex>
  );
}


