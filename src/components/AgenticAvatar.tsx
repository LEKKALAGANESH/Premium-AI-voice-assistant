import React from 'react';
import { motion, Variants } from 'motion/react';
import { VoiceState } from '../types';

interface AgenticAvatarProps {
  state: VoiceState;
}

const AgenticAvatar = ({ state }: AgenticAvatarProps) => {
  const variants: Variants = {
    idle: {
      scale: 1,
      rotate: 0,
      borderRadius: "40%",
      backgroundColor: "#16a34a", // brand-600
    },
    listening: {
      scale: [1, 1.2, 1],
      rotate: [0, 90, 180, 270, 360],
      borderRadius: ["40%", "50%", "40%"],
      backgroundColor: "#ef4444", // red-500
      transition: {
        duration: 2,
        repeat: Infinity,
        ease: "easeInOut" as const
      }
    },
    processing: {
      scale: [1, 0.8, 1.1, 1],
      borderRadius: ["40%", "30%", "50%", "40%"],
      backgroundColor: "#2563eb", // blue-600
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: "linear" as const
      }
    },
    speaking: {
      scale: [1, 1.1, 1],
      borderRadius: "50%",
      backgroundColor: "#16a34a",
      boxShadow: [
        "0 0 0 0px rgba(22, 163, 74, 0.4)",
        "0 0 0 20px rgba(22, 163, 74, 0)",
      ],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeOut" as const
      }
    },
    error: {
      scale: 1,
      borderRadius: "20%",
      backgroundColor: "#991b1b", // red-900
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        variants={variants}
        animate={state}
        className="w-12 h-12 shadow-lg"
      />
    </div>
  );
};

export default AgenticAvatar;
