import { Button } from 'antd';
import { motion } from 'framer-motion';
import { ReactNode } from 'react';

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
        shape="round"
        size="large"
        icon={icon}
        onClick={onStart}
        style={{ padding: '20px 28px', fontSize: 18 }}
      >
        {label}
      </Button>
    </motion.div>
  );
}


