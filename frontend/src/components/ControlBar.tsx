import { Space, Button, Tooltip } from 'antd';
import { AudioMutedOutlined, PhoneOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useCallStore } from '@store/callStore';

export default function ControlBar() {
  const { status, setStatus } = useCallStore();
  const isActive = status !== 'idle' && status !== 'ended';

  return (
    <Space align="center">
      <Tooltip title="静音">
        <Button shape="circle" icon={<AudioMutedOutlined />} disabled={!isActive} />
      </Tooltip>
      <Tooltip title="打断">
        <Button shape="circle" icon={<ThunderboltOutlined />} disabled={!isActive} />
      </Tooltip>
      <Tooltip title="结束通话">
        <Button
          danger
          shape="round"
          icon={<PhoneOutlined />}
          disabled={!isActive}
          onClick={() => setStatus('ended')}
        >
          挂断
        </Button>
      </Tooltip>
    </Space>
  );
}


