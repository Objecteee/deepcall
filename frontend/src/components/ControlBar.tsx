import { Space, Button, Tooltip, Card } from 'antd';
import { AudioMutedOutlined, PhoneOutlined, ThunderboltOutlined, DesktopOutlined } from '@ant-design/icons';
import { useCallStore } from '@store/callStore';

type Props = {
  onHangup?: () => void;
  // 预留屏幕共享开关回调，后续在 App 中实现具体逻辑
  onToggleScreenShare?: () => void;
  // 当前是否处于屏幕共享中，用于高亮按钮
  isScreenSharing?: boolean;
};

export default function ControlBar({ onHangup, onToggleScreenShare, isScreenSharing }: Props) {
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
          <Tooltip title={isScreenSharing ? '停止屏幕共享' : '开始屏幕共享'}>
            <Button
              shape="circle"
              size="large"
              icon={<DesktopOutlined />}
              type={isScreenSharing ? 'primary' : 'default'}
              disabled={!isActive}
              onClick={() => {
                if (onToggleScreenShare) {
                  onToggleScreenShare();
                }
              }}
            />
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


