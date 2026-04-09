"use client";

const PARTICLES = [
  { id: 1, x: "8%", y: "15%", size: "3px", dur: "7s", delay: "0s" },
  { id: 2, x: "22%", y: "42%", size: "2px", dur: "9s", delay: "1.2s" },
  { id: 3, x: "35%", y: "8%", size: "4px", dur: "6s", delay: "0.5s" },
  { id: 4, x: "48%", y: "65%", size: "2px", dur: "11s", delay: "2.1s" },
  { id: 5, x: "62%", y: "28%", size: "3px", dur: "8s", delay: "0.8s" },
  { id: 6, x: "75%", y: "55%", size: "2px", dur: "10s", delay: "3.4s" },
  { id: 7, x: "88%", y: "12%", size: "3px", dur: "7.5s", delay: "1.7s" },
  { id: 8, x: "15%", y: "78%", size: "2px", dur: "9.5s", delay: "0.3s" },
  { id: 9, x: "92%", y: "72%", size: "4px", dur: "6.5s", delay: "2.8s" },
  { id: 10, x: "55%", y: "90%", size: "2px", dur: "8.5s", delay: "1.1s" },
  { id: 11, x: "3%", y: "50%", size: "3px", dur: "12s", delay: "0.7s" },
  { id: 12, x: "40%", y: "35%", size: "2px", dur: "7s", delay: "4.2s" },
  { id: 13, x: "70%", y: "82%", size: "3px", dur: "9s", delay: "1.5s" },
  { id: 14, x: "28%", y: "20%", size: "2px", dur: "11s", delay: "3.1s" },
  { id: 15, x: "82%", y: "38%", size: "4px", dur: "8s", delay: "0.9s" },
  { id: 16, x: "17%", y: "60%", size: "2px", dur: "10s", delay: "2.6s" },
  { id: 17, x: "95%", y: "45%", size: "3px", dur: "6s", delay: "1.8s" },
  { id: 18, x: "50%", y: "18%", size: "2px", dur: "13s", delay: "0.4s" },
  { id: 19, x: "65%", y: "70%", size: "3px", dur: "7s", delay: "3.7s" },
  { id: 20, x: "10%", y: "88%", size: "2px", dur: "9s", delay: "1.3s" },
  { id: 21, x: "33%", y: "95%", size: "3px", dur: "8s", delay: "2.4s" },
  { id: 22, x: "78%", y: "5%", size: "2px", dur: "11s", delay: "0.6s" },
  { id: 23, x: "44%", y: "52%", size: "4px", dur: "6.5s", delay: "3.9s" },
  { id: 24, x: "58%", y: "30%", size: "2px", dur: "10s", delay: "1.6s" },
];

export function GradientMesh() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Cyan blob — top-left */}
      <div
        className="absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full animate-blob1"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.22) 0%, transparent 65%)",
        }}
      />
      {/* Purple blob — top-right */}
      <div
        className="absolute -right-60 top-20 h-[500px] w-[500px] rounded-full animate-blob2"
        style={{
          background: "radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)",
        }}
      />
      {/* Deep blue blob — bottom-center */}
      <div
        className="absolute bottom-0 left-1/3 h-[450px] w-[450px] rounded-full animate-blob3"
        style={{
          background: "radial-gradient(circle, rgba(37,99,235,0.16) 0%, transparent 65%)",
        }}
      />
      {/* Teal blob — bottom-right */}
      <div
        className="absolute -bottom-20 -right-20 h-[380px] w-[380px] rounded-full animate-blob4"
        style={{
          background: "radial-gradient(circle, rgba(20,184,166,0.14) 0%, transparent 65%)",
        }}
      />
      {/* Particle dots */}
      {PARTICLES.map((p) => (
        <span
          key={p.id}
          className="absolute rounded-full bg-cyan-400/40 animate-floatDot"
          style={
            {
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              "--dot-dur": p.dur,
              "--dot-delay": p.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
