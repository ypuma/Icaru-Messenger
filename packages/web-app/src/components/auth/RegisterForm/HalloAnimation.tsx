import React, { useEffect } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
import type { Variants } from "framer-motion";
import styles from "./HalloAnimation.module.scss";

const wordJump: Variants = {
  initial: { y: 50, opacity: 0 },
  animate: { y: 0, opacity: 1, transition: { duration: 0.8, ease: "easeOut" } },
  exit: { y: -30, opacity: 0, transition: { duration: 0.6, ease: "easeIn" } },
};

const icaruContainer: Variants = {
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      staggerChildren: 0.08,
      duration: 0.6,
      ease: "easeOut",
    },
  },
  initial: { opacity: 0, y: 20 },
};

const letterVariants: Variants = {
  initial: { y: 30, scale: 0.9, opacity: 0 },
  animate: {
    y: 0,
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 28,
    },
  },
  jump: {
    y: [0, -15, 0],
    transition: {
      duration: 0.7,
      ease: "easeInOut",
    },
  },
};

interface HalloAnimationProps {
  onAnimationComplete: () => void;
}

const HalloAnimation: React.FC<HalloAnimationProps> = ({ onAnimationComplete }) => {
  const [showIcaru, setShowIcaru] = React.useState(false);
  const [isIdle, setIsIdle] = React.useState(false);
  const [animationStyle, setAnimationStyle] = React.useState<'wave' | 'sequential'>('wave');
  const letterControls = Array.from({ length: 5 }, () => useAnimation());

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowIcaru(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isIdle) return;

    let isMounted = true;
    const animateLetters = async () => {
      while (isMounted) {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000 + 4000));
        if (!isMounted) break;

        if (animationStyle === 'wave') {
          for (let i = 0; i < letterControls.length; i++) {
            if (!isMounted) break;
            letterControls[i].start("jump");
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } else {
          for (let i = 0; i < letterControls.length; i++) {
            if (!isMounted) break;
            await letterControls[i].start("jump");
          }
        }
        
        if (!isMounted) break;
        setAnimationStyle(prev => (prev === 'wave' ? 'sequential' : 'wave'));
      }
    };

    animateLetters();
    return () => {
      isMounted = false;
    };
  }, [isIdle, letterControls, animationStyle]);

  return (
    <div className={styles["hallo-animation-container"]}>
      <AnimatePresence mode="wait">
        {!showIcaru ? (
          <motion.div
            key="hallo"
            className={styles["hallo-text"]}
            variants={wordJump}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            Hallo zu!
          </motion.div>
        ) : (
          <motion.div
            key="icaru"
            className={styles["hallo-text"]}
            variants={icaruContainer}
            initial="initial"
            animate="animate"
            onAnimationComplete={() => {
              onAnimationComplete();
              setIsIdle(true);
            }}
          >
            {"Icaru".split("").map((char, index) => (
              <motion.span
                key={index}
                variants={letterVariants}
                animate={letterControls[index]}
                className={styles.letter}
              >
                {char}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HalloAnimation; 