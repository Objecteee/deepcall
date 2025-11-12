import { Select } from 'antd';
import { useEffect, useState } from 'react';
import { useCallStore } from '@store/callStore';

type DeviceOption = { label: string; value: string };

export default function DeviceSelector() {
  const [options, setOptions] = useState<DeviceOption[]>([]);
  const { selectedMicId, setSelectedMicId } = useCallStore();

  useEffect(() => {
    async function load() {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const mics = devices
        .filter(d => d.kind === 'audioinput')
        .map(d => ({ label: d.label || '麦克风', value: d.deviceId }));
      setOptions(mics);
    }
    load();
  }, []);

  return (
    <Select
      placeholder="选择麦克风"
      size="small"
      style={{ width: 200 }}
      value={selectedMicId || undefined}
      options={options}
      onChange={setSelectedMicId}
    />
  );
}


