const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/components/nodes/*.tsx');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Add imports
  if (!content.includes('staggerItem')) {
    content = content.replace(/import \{ motion \} from 'framer-motion';/, "import { motion } from 'framer-motion';\nimport { staggerItem, springSnappy } from '../../lib/motion';");
  }

  // 2. Add isBreached logic
  if (!content.includes('const isBreached')) {
    content = content.replace(/const activeLens = useCanvasStore\(\(state\) => state\.activeLens\);/, 
      "const activeLens = useCanvasStore((state) => state.activeLens);\n  const { affectedNodeIds } = require('../../hooks/useBlastRadius').useBlastRadius(useCanvasStore((state) => state.selectedNodeId));\n  const isBreached = activeLens === 'blast-radius' && affectedNodeIds.has(id);");
  }

  // 3. Update the root motion.div animation
  content = content.replace(/whileHover=\{\{[\s\S]*?className=\{`([\s\S]*?)`\}/, (match, classContent) => {
    // If it has backgroundColor (Subnet/Vpc/AZ), we need to keep it
    let bgMatch = match.match(/backgroundColor:\s*\([\s\S]*?\n\s*:[\s\S]*?,/);
    let bgCode = bgMatch ? bgMatch[0] : "";
    
    let shadowCode = match.includes('activeShadow') 
      ? 'boxShadow: (selected || isHighlighted) ? "0 0 0 3px rgba(124, 111, 247, 0.15)" : activeShadow,'
      : 'boxShadow: (selected || isHighlighted) ? "0 0 0 3px rgba(124, 111, 247, 0.15)" : "0px 4px 12px rgba(0, 0, 0, 0.1)",';

    return `variants={{
        initial: staggerItem.initial,
        animate: {
          ...(staggerItem.animate as any),
          opacity: opacity,
          borderColor: (selected || isHighlighted) ? "#7C6FF7" : "rgba(255, 255, 255, 0.08)",
          borderWidth: (selected || isHighlighted) ? "1px" : "0.5px",
          ${bgCode}
          ${shadowCode}
          transition: { duration: (selected || isHighlighted) ? 0.15 : 0.12, ease: "easeOut" }
        }
      }}
      className={\`${classContent} \${isBreached ? 'gl-pulse-breach' : ''}\`}`;
  });

  // 4. Add hover to Icon wrapper
  content = content.replace(/<div className="w-12 h-12 rounded-xl bg-white/g, '<motion.div whileHover={{ scale: 1.02 }} transition={springSnappy} className="w-12 h-12 rounded-xl bg-white');
  content = content.replace(/<div className="w-2 h-2 rounded-full animate-pulse"/g, '<motion.div whileHover={{ scale: 1.02 }} transition={springSnappy} className="w-2 h-2 rounded-full animate-pulse"');
  
  // Close motion.div for icon wrappers
  content = content.replace(/(<motion\.div whileHover=\{\{ scale: 1\.02 \}\} transition=\{springSnappy\} className="w-12 h-12[\s\S]*?<Image[\s\S]*?\/>\n\s*)<\/div>/g, '$1</motion.div>');
  content = content.replace(/(<motion\.div whileHover=\{\{ scale: 1\.02 \}\} transition=\{springSnappy\} className="w-2 h-2[\s\S]*?)<\/div>/g, '$1</motion.div>');

  // Also remove `initial=` and `animate=` props from the node div if they exist, so our variants block isn't overridden by old props that might not have been caught
  content = content.replace(/\n\s*initial=\{\{[\s\S]*?\}\}/g, '');
  content = content.replace(/\n\s*animate=\{\{[\s\S]*?\}\}\n\s*transition=\{\{[\s\S]*?\}\}/g, '');

  fs.writeFileSync(file, content);
}
console.log('Done nodes update!');
