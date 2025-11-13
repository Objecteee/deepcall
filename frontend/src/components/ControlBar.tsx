import { Space, Button, Tooltip, Card } from 'antd';
import { AudioMutedOutlined, PhoneOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useCallStore } from '@store/callStore';

type Props = {
  onHangup?: () => void;
};

export default function ControlBar({ onHangup }: Props) {
  const { status, setStatus } = useCallStore();
  const isActive = status !== 'idle' && status !== 'ended';

  return (
    <div className="floating-controls">
      <Card className="glass-card" size="small" styles={{ body: { padding: 10 } }}>
        <Space align="center">
          <Tooltip title="静音">
            <Button shape="circle" size="large" icon={<AudioMutedOutlined />} disabled={!isActive} />
          </Tooltip>
          <Tooltip title="打断">
            <Button shape="circle" size="large" icon={<ThunderboltOutlined />} disabled={!isActive} />
          </Tooltip>
          <Tooltip title="结束通话">
            <Button
              danger
              type="primary"
              shape="round"
              size="large"
              icon={<PhoneOutlined />}
              disabled={!isActive}
              onClick={() => {
                if (onHangup) onHangup();
                else setStatus('ended');
              }}
            >
              挂断
            </Button>
          </Tooltip>
        </Space>
      </Card>
    </div>
  );
}


