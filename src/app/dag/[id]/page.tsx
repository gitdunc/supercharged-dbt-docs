import fs from 'fs';
import path from 'path';
import React from 'react';
import DagViewer from '@/components/DagViewer';

export async function generateStaticParams() {
  try {
    const dagDir = path.resolve(process.cwd(), 'public', 'dag');
    const files = fs.existsSync(dagDir) ? fs.readdirSync(dagDir) : [];
    return files
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ id: f.replace(/\.json$/, '') }));
  } catch (e: any) {
    return [];
  }
}

export default function DagPage({ params }: { params: { id: string } }) {
  const id = params.id;
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .app-menu { display: none !important; }
            .app-content { width: 100% !important; }
            .app-content > .app-header { display: none !important; }
            .app-content > .app-body { height: 100vh !important; padding: 0 !important; }
            .app-content > .app-body > .app-scroll {
              height: 100% !important;
              width: 100% !important;
              padding: 12px !important;
              overflow: hidden !important;
            }
          `,
        }}
      />
      <div className="app-scroll" style={{ height: "100%", width: "100%" }}>
        <DagViewer uniqueId={id} defaultRender={true} />
      </div>
    </>
  );
}
