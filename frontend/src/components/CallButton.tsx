import { Button } from 'antd';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';
import { PhoneFilled } from '@ant-design/icons';

type Props = {
  onStart: () => void;
  label?: string;
  icon?: ReactNode;
};

export default function CallButton({ onStart, label = '开始通话', icon }: Props) {
  return (
    <motion.div
      animate={{ scale: [1, 1.04, 1] }}
      transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
      style={{ display: 'inline-block' }}
    >
      <Button
        type="primary"
        shape="circle"
        size="large"
        icon={icon ?? <PhoneFilled />}
        onClick={onStart}
        style={{ width: 88, height: 88, fontSize: 22, display: 'grid', placeItems: 'center' }}
      >
        {/* no text to keep it minimal like ChatGPT */}
      </Button>
    </motion.div>
  );
}


