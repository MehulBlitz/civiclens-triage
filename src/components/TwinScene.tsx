"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import type { Group } from "three";
import type { Complaint } from "@/lib/schema";

/**
 * Civic Digital Twin — the city as spatial objects, not pins.
 *
 * Incident language (subtle, professional):
 *   • Pothole   — crater (sunk cylinder + rim)
 *   • Drainage  — translucent flood volume over the block
 *   • Waste     — accumulation heap that grows with crowd confirmations
 *   • Sewage    — translucent spill disc
 *   • Water     — spray cone
 *   • Emerging  — growing pulse ring (recent complaint, < 6h)
 *   • Critical  — controlled expanding warning boundary
 *
 * Quality ladder:
 *   HIGH — orbit controls, Html labels, pulse rings, full ambient city
 *   LOW  — auto-rotating rig, no labels, halved geometry, lower DPR
 */

const PRIORITY_HEX: Record<string, string> = {
  urgent: "#e11d48",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#0ea5e9"
};

export type TwinQuality = "high" | "low";

type SceneProps = {
  items: Complaint[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  quality: TwinQuality;
};

function gridLayout(items: Complaint[]): { x: number; z: number }[] {
  const cols = Math.ceil(Math.sqrt(Math.max(1, items.length)));
  const out: { x: number; z: number }[] = [];
  items.forEach((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * 3.2;
    const z = (row - (cols - 1) / 2) * 3.2;
    out.push({ x, z });
  });
  return out;
}

function Pothole({ color, reports }: { color: string; reports: number }) {
  const scale = 1 + Math.min(1.2, (reports - 1) * 0.25);
  return (
    <group>
      <mesh position={[0, 0.02, 0]}>
        <torusGeometry args={[0.62 * scale, 0.1, 10, 24]} />
        <meshStandardMaterial color="#4b5563" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.18 * scale, 0]}>
        <cylinderGeometry args={[0.58 * scale, 0.44 * scale, 0.4 * scale, 20]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.6} />
      </mesh>
    </group>
  );
}

function FloodVolume({ color, reports }: { color: string; reports: number }) {
  const h = 0.5 + Math.min(1.4, (reports - 1) * 0.3);
  return (
    <mesh position={[0, h / 2, 0]}>
      <boxGeometry args={[2.2, h, 2.2]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.42}
        emissive={color}
        emissiveIntensity={0.3}
        roughness={0.15}
        metalness={0.1}
      />
    </mesh>
  );
}

function WasteHeap({ color, reports }: { color: string; reports: number }) {
  const r = 0.45 + Math.min(0.8, (reports - 1) * 0.18);
  return (
    <group>
      <mesh position={[0, r / 2.4, 0]}>
        <coneGeometry args={[r, r * 1.4, 9]} />
        <meshStandardMaterial color="#3f3f46" roughness={1} />
      </mesh>
      <mesh position={[r * 0.4, r * 0.6, r * 0.2]}>
        <sphereGeometry args={[r * 0.3, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function SpillDisc({ color }: { color: string }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.95, 24]} />
        <meshStandardMaterial color={color} transparent opacity={0.5} emissive={color} emissiveIntensity={0.35} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

function SprayCone({ color }: { color: string }) {
  return (
    <mesh position={[0, 0.55, 0]}>
      <coneGeometry args={[0.3, 1.1, 12]} />
      <meshStandardMaterial color={color} transparent opacity={0.55} emissive={color} emissiveIntensity={0.6} />
    </mesh>
  );
}

function Pillar({ color, height }: { color: string; height: number }) {
  return (
    <mesh position={[0, height / 2, 0]}>
      <boxGeometry args={[0.5, height, 0.5]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
    </mesh>
  );
}

function IncidentObject({ complaint, reports }: { complaint: Complaint; reports: number }) {
  const hex = PRIORITY_HEX[complaint.priority] ?? PRIORITY_HEX.medium;
  switch (complaint.category) {
    case "Pothole":
      return <Pothole color={hex} reports={reports} />;
    case "Drainage":
      return <FloodVolume color="#2563eb" reports={reports} />;
    case "Waste":
      return <WasteHeap color={hex} reports={reports} />;
    case "Sewage":
      return <SpillDisc color="#84cc16" />;
    case "Water":
      return <SprayCone color="#38bdf8" />;
    case "Graffiti":
      return <Pillar color="#a78bfa" height={0.7} />;
    default:
      return <Pillar color={hex} height={0.9} />;
  }
}

/** Emerging (<6h old): a growing pulse ring — new incident energy. */
function PulseRing({ color, ageHours }: { color: string; ageHours: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const growth = Math.max(0.35, 1 - ageHours / 6); // fresher = stronger
    const phase = (t * 0.35 * growth) % 1;
    ref.current.scale.setScalar(1 + phase * 0.9);
    ref.current.children.forEach((c) => {
      const m = c as unknown as { material?: { opacity: number } };
      if (m.material) m.material.opacity = 0.55 * growth * (1 - phase);
    });
  });
  return (
    <group ref={ref} position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[0.9, 1.0, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

/** Critical boundary: slow, controlled breathing warning ring (no bounce). */
function CriticalBoundary() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const s = 1.15 + Math.sin(clock.elapsedTime * 0.9) * 0.06;
    ref.current.scale.setScalar(s);
  });
  return (
    <group ref={ref} position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[1.35, 1.45, 40]} />
        <meshBasicMaterial color="#e11d48" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function CityBlock({ density, x, z }: { density: number; x: number; z: number }) {
  const h = 0.35 + Math.min(2.2, density * 0.5);
  return (
    <mesh position={[x, h / 2, z]}>
      <boxGeometry args={[1.5, h, 1.5]} />
      <meshStandardMaterial
        color={density > 2 ? "#7f1d1d" : density > 0 ? "#334155" : "#1e293b"}
        roughness={0.85}
      />
    </mesh>
  );
}

/** Ambient city ring — deterministic pseudo-density skyline. */
function AmbientCity({ count }: { count: number }) {
  const blocks = useMemo(() => {
    const arr: { x: number; z: number; density: number }[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const radius = 4.2 + ((i * 7) % 3) * 1.6;
      arr.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        density: ((i * 37) % 5) / 2
      });
    }
    return arr;
  }, [count]);
  return (
    <>
      {blocks.map((b, i) => (
        <CityBlock key={i} x={b.x} z={b.z} density={b.density} />
      ))}
    </>
  );
}

function CityContents({ items, selectedId, onSelect, quality }: SceneProps) {
  const layout = useMemo(() => gridLayout(items), [items]);
  const shown = quality === "high" ? items.slice(0, 24) : items.slice(0, 12);
  const selected = shown.find((c) => c.id === selectedId);

  return (
    <>
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#38bdf8" />

      {/* ground plate + grid rings */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[11, 40]} />
        <meshStandardMaterial color="#0b1c2b" roughness={1} />
      </mesh>
      {[4, 7, 10].map((r) => (
        <mesh key={r} position={[0, -0.34, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.04, r, 48]} />
          <meshBasicMaterial color="#1f668c" transparent opacity={0.35} />
        </mesh>
      ))}

      <AmbientCity count={quality === "high" ? 24 : 10} />

      {shown.map((c, i) => {
        const pos = layout[i];
        const reports = c.reportCount ?? 1;
        const ageHours =
          (Date.now() - new Date(c.createdAt).getTime()) / 3_600_000;
        const isSelected = c.id === selectedId;
        return (
          <group
            key={c.id}
            position={[pos.x, 0, pos.z]}
            onPointerDown={() => onSelect(c.id)}
          >
            <IncidentObject complaint={c} reports={reports} />
            {quality === "high" && ageHours < 6 && (
              <PulseRing color={PRIORITY_HEX[c.priority] ?? "#f59e0b"} ageHours={ageHours} />
            )}
            {quality === "high" && c.priority === "urgent" && <CriticalBoundary />}
            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.1, 1.24, 36]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
              </mesh>
            )}
            {/* invisible click target */}
            <mesh position={[0, 0.6, 0]} visible={false}>
              <boxGeometry args={[2.4, 1.8, 2.4]} />
            </mesh>
            {quality === "high" && (isSelected || reports > 1) && (
              <Html distanceFactor={14} position={[0, 1.6, 0]} center>
                <div
                  className="whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold shadow-lift"
                  style={{
                    background: "rgba(255,255,255,0.95)",
                    color: "#16304f",
                    border: "1px solid #c9d3df"
                  }}
                >
                  #{c.id} {c.category}
                  {reports > 1 ? ` ×${reports}` : ""}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {quality === "high" && selected && (
        <Html distanceFactor={16} position={[0, 3.2, 0]} center>
          <div
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-bold shadow-lift"
            style={{
              background: "rgba(11,28,43,0.92)",
              color: "#dbe7f5",
              border: "1px solid #2c5c97"
            }}
          >
            INCIDENT #{selected.id} · {selected.priority.toUpperCase()}
          </div>
        </Html>
      )}
    </>
  );
}

/** All incident objects + labels — the city's live layer. */
function IncidentLayer({ items, selectedId, onSelect, quality }: SceneProps) {
  const layout = useMemo(() => gridLayout(items), [items]);
  const shown = quality === "high" ? items.slice(0, 24) : items.slice(0, 12);
  const selected = shown.find((c) => c.id === selectedId);

  return (
    <>
      {shown.map((c, i) => {
        const pos = layout[i];
        const reports = c.reportCount ?? 1;
        const ageHours =
          (Date.now() - new Date(c.createdAt).getTime()) / 3_600_000;
        const isSelected = c.id === selectedId;
        return (
          <group
            key={c.id}
            position={[pos.x, 0, pos.z]}
            onPointerDown={() => onSelect(c.id)}
          >
            <IncidentObject complaint={c} reports={reports} />
            {quality === "high" && ageHours < 6 && (
              <PulseRing color={PRIORITY_HEX[c.priority] ?? "#f59e0b"} ageHours={ageHours} />
            )}
            {quality === "high" && c.priority === "urgent" && <CriticalBoundary />}
            {isSelected && (
              <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <ringGeometry args={[1.1, 1.24, 36]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
              </mesh>
            )}
            {/* invisible click target */}
            <mesh position={[0, 0.6, 0]} visible={false}>
              <boxGeometry args={[2.4, 1.8, 2.4]} />
            </mesh>
            {quality === "high" && (isSelected || reports > 1) && (
              <Html distanceFactor={14} position={[0, 1.6, 0]} center>
                <div
                  className="whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold shadow-lift"
                  style={{
                    background: "rgba(255,255,255,0.95)",
                    color: "#16304f",
                    border: "1px solid #c9d3df"
                  }}
                >
                  #{c.id} {c.category}
                  {reports > 1 ? ` ×${reports}` : ""}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      {quality === "high" && selected && (
        <Html distanceFactor={16} position={[0, 3.2, 0]} center>
          <div
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-bold shadow-lift"
            style={{
              background: "rgba(11,28,43,0.92)",
              color: "#dbe7f5",
              border: "1px solid #2c5c97"
            }}
          >
            INCIDENT #{selected.id} · {selected.priority.toUpperCase()}
          </div>
        </Html>
      )}
    </>
  );
}

export default function TwinScene({ items, selectedId, onSelect, quality }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 6.5, 10], fov: 45 }}
      dpr={quality === "high" ? [1, 2] : [0.75, 1]}
      gl={{
        antialias: quality === "high",
        alpha: true,
        powerPreference: "high-performance"
      }}
      style={{ background: "linear-gradient(#081c2a, #0b1c2b)" }}
      className="h-[420px] w-full rounded-xl"
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} />
      <pointLight position={[0, 5, 0]} intensity={0.5} color="#38bdf8" />

      {/* ground plate + grid rings */}
      <mesh position={[0, -0.35, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[11, 40]} />
        <meshStandardMaterial color="#0b1c2b" roughness={1} />
      </mesh>
      {[4, 7, 10].map((r) => (
        <mesh key={r} position={[0, -0.34, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.04, r, 48]} />
          <meshBasicMaterial color="#1f668c" transparent opacity={0.35} />
        </mesh>
      ))}

      <AmbientCity count={quality === "high" ? 24 : 10} />

      <IncidentLayer
        items={items}
        selectedId={selectedId}
        onSelect={onSelect}
        quality={quality}
      />

      {quality === "high" && (
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={6}
          maxDistance={18}
          maxPolarAngle={Math.PI / 2.2}
          autoRotate
          autoRotateSpeed={0.4}
        />
      )}
    </Canvas>
  );
}
