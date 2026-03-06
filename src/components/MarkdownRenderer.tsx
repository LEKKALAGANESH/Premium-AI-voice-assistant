import React, { memo, useMemo } from 'react';
import Markdown from 'react-markdown';
import { Database, Brain, BarChart3, Code, Globe, Lightbulb, Wrench, Layers, Zap, BookOpen } from 'lucide-react';

// Icon picker: match keywords in the title to a relevant icon
const ICON_MAP: [RegExp, React.ElementType][] = [
  [/data\s*pipeline|etl|ingestion|data\s*flow/i, Database],
  [/machine\s*learn|ml|model|neural|deep\s*learn|ai\b/i, Brain],
  [/analy|insight|metric|dashboard|report|visuali/i, BarChart3],
  [/code|program|develop|software|engineer|build/i, Code],
  [/translat|language|bilingual|multilingual|locali/i, Globe],
  [/idea|creativ|innovat|brainstorm|inspir/i, Lightbulb],
  [/tool|config|setup|deploy|infra|devops|ci\/cd/i, Wrench],
  [/architect|system|design|stack|framework|layer/i, Layers],
  [/perform|speed|optim|fast|latenc|efficien/i, Zap],
  [/learn|study|educat|teach|mentor|course|book/i, BookOpen],
];

function pickIcon(text: string): React.ElementType {
  for (const [pattern, Icon] of ICON_MAP) {
    if (pattern.test(text)) return Icon;
  }
  return Lightbulb; // default
}

// Detect if a list item has "**Bold Title** — description" pattern
function parseFeatureItem(children: React.ReactNode): { title: string; description: string } | null {
  // Flatten children to text for analysis
  const text = reactNodeToText(children);
  // Match: "Bold Title" followed by separator and description
  // The bold part is rendered by react-markdown as <strong>, so we check for that
  if (!text || text.length < 5) return null;

  // Check if children contains a <strong> element
  const childArray = React.Children.toArray(children);
  let title = '';
  let descParts: string[] = [];
  let foundStrong = false;

  for (const child of childArray) {
    if (React.isValidElement(child) && child.type === 'strong') {
      const props = child.props as { children?: React.ReactNode };
      title = reactNodeToText(props.children);
      foundStrong = true;
    } else if (foundStrong) {
      const part = typeof child === 'string' ? child : reactNodeToText(child);
      descParts.push(part);
    }
  }

  if (!foundStrong || !title) return null;

  const description = descParts.join('').replace(/^\s*[-:\u2014\u2013]\s*/, '').trim();
  return { title, description };
}

function reactNodeToText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(reactNodeToText).join('');
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    if (props.children) return reactNodeToText(props.children);
  }
  return '';
}

// Feature Card for structured list items
const FeatureCard = memo(({ title, description }: { title: string; description: string }) => {
  const Icon = useMemo(() => pickIcon(title + ' ' + description), [title, description]);

  return (
    <div className="flex items-start gap-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-3.5 py-2.5 my-1.5 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800">
      <div className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center">
        <Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
      </div>
      <div className="min-w-0">
        <p className="vox-premium-bold text-zinc-900 dark:text-zinc-100 leading-snug" style={{ fontSize: 'inherit' }}>
          {title}
        </p>
        {description && (
          <p className="text-zinc-500 dark:text-zinc-400 leading-snug mt-0.5" style={{ fontSize: 'inherit' }}>
            {description}
          </p>
        )}
      </div>
    </div>
  );
});
FeatureCard.displayName = 'FeatureCard';

// Main renderer
interface MarkdownRendererProps {
  content: string;
}

const MarkdownRenderer = memo(({ content }: MarkdownRendererProps) => {
  return (
    <Markdown
      components={{
        // Paragraphs
        p: ({ children }) => (
          <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>
        ),

        // Bold — Premium "Culinary Menu" typography with Playfair Display
        strong: ({ children }) => (
          <strong className="vox-premium-bold text-zinc-900 dark:text-zinc-50">{children}</strong>
        ),

        // Italic
        em: ({ children }) => (
          <em className="italic">{children}</em>
        ),

        // Inline code
        code: ({ children }) => (
          <code className="bg-zinc-100 dark:bg-zinc-800 text-brand-600 dark:text-brand-400 px-1.5 py-0.5 rounded text-[0.85em] font-mono">
            {children}
          </code>
        ),

        // Code blocks
        pre: ({ children }) => (
          <pre className="bg-zinc-100 dark:bg-zinc-800 rounded-lg p-3 my-2 overflow-x-auto text-[0.85em] font-mono">
            {children}
          </pre>
        ),

        // Unordered lists
        ul: ({ children }) => (
          <div className="my-1.5 space-y-0.5">{children}</div>
        ),

        // Ordered lists
        ol: ({ children }) => (
          <div className="my-1.5 space-y-0.5">{children}</div>
        ),

        // List items — detect feature card pattern
        li: ({ children, ...props }) => {
          const feature = parseFeatureItem(children);
          if (feature) {
            return <FeatureCard title={feature.title} description={feature.description} />;
          }

          // Render as a clean bullet point
          return (
            <div className="flex items-start gap-2 py-0.5">
              <span className="shrink-0 mt-[0.45em] w-1.5 h-1.5 rounded-full bg-brand-500/60" />
              <span className="leading-relaxed">{children}</span>
            </div>
          );
        },

        // Headings
        h1: ({ children }) => (
          <h3 className="font-bold text-lg mb-1.5 mt-2 first:mt-0">{children}</h3>
        ),
        h2: ({ children }) => (
          <h4 className="font-bold text-base mb-1 mt-1.5 first:mt-0">{children}</h4>
        ),
        h3: ({ children }) => (
          <h5 className="font-semibold mb-1 mt-1 first:mt-0">{children}</h5>
        ),

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-3 border-brand-500/40 pl-3 my-1.5 text-zinc-600 dark:text-zinc-400 italic">
            {children}
          </blockquote>
        ),

        // Links
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 dark:text-brand-400 underline underline-offset-2 hover:text-brand-700 dark:hover:text-brand-300"
          >
            {children}
          </a>
        ),

        // Horizontal rules
        hr: () => (
          <hr className="my-2 border-zinc-200 dark:border-zinc-700" />
        ),
      }}
    >
      {content}
    </Markdown>
  );
});

MarkdownRenderer.displayName = 'MarkdownRenderer';
export default MarkdownRenderer;
