import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Transition, Variants } from "framer-motion";
import styles from "./WelcomeScreen.module.scss";
import RegistrationScreen from "./RegistrationScreen";
import RecoveryScreen from "../RecoveryForm/RecoveryScreen";
import HalloAnimation from "./HalloAnimation";

interface AccountData {
  handle: string;
  publicKey: string;
  privateKey: string;
}

interface WelcomeScreenProps {
  onAccountCreated: (userData: AccountData) => void;
}

const pageVariants: Variants = {
  initial: (dir: number) => ({ opacity: 0, x: dir * 20 + "vw" }),
  in: { opacity: 1, x: 0 },
  out: (dir: number) => ({ opacity: 0, x: -dir * 20 + "vw" }),
};

const pageTransition: Transition = {
  type: "tween",
  ease: "easeInOut",
  duration: 0.5,
};

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onAccountCreated }) => {
  const [showRegistration, setShowRegistration] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [showButtons, setShowButtons] = useState(false);

  // determine direction for animation of current visible form
  const dir = direction;

  const handleLogin = () => {
    setDirection(1);
    setShowRecovery(true);
  };

  const handleRegister = () => {
    setDirection(1);
    setShowRegistration(true);
    setShowRecovery(false);
  };

  const handleBack = () => {
    setDirection(1);
    setShowRegistration(false);
    setShowRecovery(false);
  };

  const handleHalloAnimationComplete = () => {
    setShowButtons(true);
  };

  return (
    <div className={styles["welcome-root"]}>
      <AnimatePresence mode="wait">
        {!showRegistration && !showRecovery ? (
          <motion.div
            key="welcome"
            className={styles["welcome-content"]}
            custom={dir}
            variants={pageVariants}
            initial="initial"
            animate="in"
            exit="out"
            transition={pageTransition}
          >
            <img
              src="/assets/welcome-background.gif"
              alt=""
              className={styles["background-gif"]}
              aria-hidden="true"
            />
            <HalloAnimation onAnimationComplete={handleHalloAnimationComplete} />
            <AnimatePresence>
              {showButtons ? (
                <motion.div
                  className={styles["einreg-frame"]}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <div className={styles.button} onClick={handleLogin} tabIndex={0} role="button" aria-label="Einloggen">
                    <span className={styles["button-text"]}>Wiederherstellen</span>
                  </div>
                  <div className={styles.button} onClick={handleRegister} tabIndex={0} role="button" aria-label="Registrieren">
                    <span className={styles["button-text"]}>Registrieren</span>
                  </div>
                </motion.div>
              ) : (
                <div className={styles["einreg-frame-placeholder"]} />
              )}
            </AnimatePresence>
          </motion.div>
        ) : showRegistration ? (
          <motion.div
            key="registration"
            custom={dir}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <RegistrationScreen onBack={handleBack} onContinue={onAccountCreated} />
          </motion.div>
        ) : (
          <motion.div
            key="recovery"
            custom={dir}
            initial="initial"
            animate="in"
            exit="out"
            variants={pageVariants}
            transition={pageTransition}
          >
            <RecoveryScreen onBack={handleBack} onRecovered={onAccountCreated} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WelcomeScreen; 