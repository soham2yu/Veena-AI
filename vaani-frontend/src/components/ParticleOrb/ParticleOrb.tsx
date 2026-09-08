import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { vertexShader, fragmentShader } from '@/shaders/shaders';
import gsap from 'gsap';

interface ParticleOrbProps {
  audioAmplitude: number;
  aiState: number;
  isTextVisible?: boolean;
}

const PARTICLE_COUNT = 80000;
const AMBIENT_COUNT = 3000;

export default function ParticleOrb({ audioAmplitude, aiState, isTextVisible = false }: ParticleOrbProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const coreRef = useRef<THREE.Group>(null);
  const ambientRef = useRef<THREE.Points>(null);
  
  // GSAP animation targets
  const scaleTarget = useRef({ scale: 1.0 });
  const splitTarget = useRef({ split: 0.0 });
  const rotationSpeedRef = useRef(1.0);

  useEffect(() => {
    const targetScale = (aiState === 3 || aiState === 0) ? 0.5 : 1.0;
    gsap.killTweensOf(scaleTarget.current);
    gsap.to(scaleTarget.current, {
      scale: targetScale,
      duration: 1.2,
      ease: "power2.inOut"
    });

    const targetSplit = aiState === 2 ? 1.0 : 0.0;
    gsap.killTweensOf(splitTarget.current);
    gsap.to(splitTarget.current, {
      split: targetSplit,
      duration: 1.5,
      ease: "power2.inOut"
    });
  }, [aiState]);

  useEffect(() => {
    gsap.to(rotationSpeedRef, {
      current: isTextVisible ? 0.0 : 1.0,
      duration: 1.5,
      ease: "power2.inOut"
    });
  }, [isTextVisible]);

  // Main orb particles — smaller sizes
  const { positions, sizes, randoms } = useMemo(() => {
    const count = PARTICLE_COUNT;
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 1.5) * 4.5; 
      
      const coreThickness = 1.4;
      const edgeThickness = 0.08;
      const thickness = edgeThickness + (coreThickness - edgeThickness) * Math.max(0, 1.0 - (radius / 4.5));
      
      const warp = Math.sin(angle * 3.0) * 0.15;
      const y = (Math.random() - 0.5) * thickness * 2.0 + warp;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      // Decreased particle sizes
      const coreSizeMultiplier = Math.max(0.4, 1.0 - (radius / 4.5));
      sizes[i] = (Math.random() * 0.08 + 0.02) * coreSizeMultiplier;

      randoms[i * 3] = Math.random() * 100;
      randoms[i * 3 + 1] = Math.random() * 100;
      randoms[i * 3 + 2] = Math.random() * 100;
    }

    return { positions, sizes, randoms };
  }, []);

  // Ambient floating particles that drift toward the orb
  const ambientData = useMemo(() => {
    const pos = new Float32Array(AMBIENT_COUNT * 3);
    const vel = new Float32Array(AMBIENT_COUNT * 3); // velocity toward center
    const seed = new Float32Array(AMBIENT_COUNT); // per-particle random seed
    
    for (let i = 0; i < AMBIENT_COUNT; i++) {
      // Spawn in a large sphere around the orb (radius 6–15)
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 6 + Math.random() * 9;
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
      
      // Store initial positions as velocities (we'll compute direction in the frame loop)
      vel[i * 3] = pos[i * 3];
      vel[i * 3 + 1] = pos[i * 3 + 1];
      vel[i * 3 + 2] = pos[i * 3 + 2];
      
      seed[i] = Math.random();
    }
    
    return { pos, vel, seed };
  }, []);

  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uAmplitude: { value: 0 },
    uState: { value: 0 },
    uScale: { value: 1.0 },
    uSplit: { value: 0.0 },
    uColorStart: { value: new THREE.Color('#3b82f6') },
    uColorEnd: { value: new THREE.Color('#10b981') }
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      materialRef.current.uniforms.uAmplitude.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uAmplitude.value,
        audioAmplitude,
        0.1
      );
      materialRef.current.uniforms.uState.value = aiState;
      materialRef.current.uniforms.uScale.value = scaleTarget.current.scale;
      materialRef.current.uniforms.uSplit.value = splitTarget.current.split;
    }

    if (pointsRef.current) {
      const speed = rotationSpeedRef.current;
      pointsRef.current.rotation.y += 0.001 * speed;
      pointsRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.1 * speed;
    }

    // Animate neural core
    if (coreRef.current) {
      const t = state.clock.elapsedTime;
      const pulse = 1.0 + Math.sin(t * 2.0) * 0.08 + audioAmplitude * 0.3;
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.rotation.y = t * 0.5;
      coreRef.current.rotation.z = t * 0.3;
    }

    // Animate ambient particles drifting toward center
    if (ambientRef.current) {
      const geo = ambientRef.current.geometry;
      const posAttr = geo.getAttribute('position');
      const arr = posAttr.array as Float32Array;
      const t = state.clock.elapsedTime;
      
      for (let i = 0; i < AMBIENT_COUNT; i++) {
        const ix = i * 3;
        let x = arr[ix];
        let y = arr[ix + 1];
        let z = arr[ix + 2];
        
        const dist = Math.sqrt(x * x + y * y + z * z);
        
        // Direction toward center
        const dx = -x / dist;
        const dy = -y / dist;
        const dz = -z / dist;
        
        // Speed: slow drift inward with slight wobble
        const speed = 0.008 + ambientData.seed[i] * 0.012;
        const wobble = Math.sin(t * 0.5 + ambientData.seed[i] * 100) * 0.005;
        
        x += (dx * speed) + wobble;
        y += (dy * speed) + wobble * 0.5;
        z += (dz * speed) - wobble;
        
        // When particle reaches the orb (dist < 1.5), respawn it far away
        const newDist = Math.sqrt(x * x + y * y + z * z);
        if (newDist < 1.5) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          const r = 8 + Math.random() * 7;
          x = r * Math.sin(phi) * Math.cos(theta);
          y = r * Math.sin(phi) * Math.sin(theta);
          z = r * Math.cos(phi);
        }
        
        arr[ix] = x;
        arr[ix + 1] = y;
        arr[ix + 2] = z;
      }
      
      posAttr.needsUpdate = true;
      ambientRef.current.rotation.y = t * 0.02;
    }
  });

  return (
    <group>
      {/* 3D Neural Core */}
      <group ref={coreRef}>
        <mesh>
          <sphereGeometry args={[0.12, 24, 24]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.2, 24, 24]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.35, 24, 24]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.28, 0.015, 8, 32]} />
          <meshBasicMaterial color="#60a5fa" transparent opacity={0.25} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>

      {/* Main particle field */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={PARTICLE_COUNT} array={positions} itemSize={3} />
          <bufferAttribute attach="attributes-aSize" count={PARTICLE_COUNT} array={sizes} itemSize={1} />
          <bufferAttribute attach="attributes-aRandom" count={PARTICLE_COUNT} array={randoms} itemSize={3} />
        </bufferGeometry>
        <shaderMaterial
          ref={materialRef}
          vertexShader={vertexShader}
          fragmentShader={fragmentShader}
          uniforms={uniforms}
          transparent={true}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Ambient particles drifting inward */}
      <points ref={ambientRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={AMBIENT_COUNT} array={ambientData.pos} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          color="#60a5fa"
          size={0.04}
          transparent={true}
          opacity={0.35}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          sizeAttenuation={true}
        />
      </points>
    </group>
  );
}
