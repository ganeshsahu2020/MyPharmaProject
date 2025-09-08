import React, { useEffect, useRef } from "react";
import { initAvatarScene } from "../three/avatar-scene";

export default function AvatarPlayground() {
  const mountRef = useRef(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const dispose = initAvatarScene(mountRef.current);
    return () => dispose?.();
  }, []);

  return (
    <div
      style={{
        width: "640px",
        height: "360px",
        background: "black",
        borderRadius: 12,
      }}
    >
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
