import { NextResponse } from 'next/server';
import { generateObjectWithFallback } from '@/lib/ai/config';
import { z } from 'zod';

export const runtime = 'edge';

// In a real app, this would be a database like D1, Postgres, or Firestore
// Using a global variable for simple in-memory task tracking during dev
declare global {
  var taskStatuses: Map<string, any>;
}
if (!global.taskStatuses) {
  global.taskStatuses = new Map<string, any>();
}

export async function POST(req: Request) {
  let taskId: string | undefined;
  try {
    const body = await req.json();
    taskId = body.taskId;
    const { imageUrl, base64, snippets } = body;

    if (!taskId) {
      return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
    }

    console.log(`[Webhook] Processing image for task ${taskId}`);
    
    // Update status to processing
    global.taskStatuses.set(taskId, { status: 'processing' });

    let systemPrompt = 'Please analyze this exam mistake image. Extract the original question, the student\'s answer, the correct answer, and explain the core concept and why the student made the mistake.';
    let aiContent: any[] = [];

    if (snippets && snippets.length > 0) {
      systemPrompt = '你是一个阅卷助手。用户传入了若干张局部截图。请对比带有【题目正文】和【我的错解】标签的图片，提取题干并用一句话指出错解违背了什么概念。并给出一个知识图谱的局部变更提案。';
      aiContent = [
        { type: 'text', text: systemPrompt },
        ...snippets.flatMap((s: any) => [
          { type: 'text', text: `[图片附件标签: ${s.tag}]` },
          { type: 'image', image: s.base64 }
        ])
      ];
    } else {
      const imageContent = imageUrl 
      ? { type: 'image', image: imageUrl } 
      : { type: 'image', image: base64 };
      aiContent = [
        { type: 'text', text: systemPrompt },
        imageContent as any
      ];
    }

    // Call Gemini Vision model to analyze the mistake using Structured Outputs
    const result = await generateObjectWithFallback({
      tier: 'smart',
      schema: z.object({
        originalQuestion: z.string().describe("The original question text from the image (use LaTeX for math)"),
        studentAnswer: z.string().describe("The student's incorrect answer"),
        correctAnswer: z.string().describe("The correct answer to the question"),
        coreConcept: z.string().describe("The core knowledge concept being tested"),
        explanation: z.string().describe("Explanation of why the student made the mistake and how to fix it"),
        graphProposal: z.object({
          action: z.enum(['LINK_EXISTING', 'CREATE_NODE', 'ADD_RELATION']).describe("LINK_EXISTING: 挂载现有; CREATE_NODE: 新建节点; ADD_RELATION: 添加易混淆关联"),
          suggestedNodeName: z.string().optional().describe("If creating a node or adding relation, the target node name"),
          reasoning: z.string().describe("向用户解释为什么要建立这个图谱关联（用启发式的口吻，例如'看起来你在这道题上混淆了...'）")
        }).describe("局部拓扑图变更预测")
      }),
      messages: [
        {
          role: 'user',
          content: aiContent
        }
      ]
    });

    // Save to Database (Mocked here)
    global.taskStatuses.set(taskId, { 
      status: 'completed', 
      result: result.object 
    });

    console.log(`[Webhook] Completed task ${taskId}`);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('[Webhook API] Error:', error);
    if (taskId) {
      global.taskStatuses.set(taskId, { status: 'failed', error: String(error) });
    }
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Simple endpoint to check task status
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');
  
  if (!taskId) {
    return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });
  }
  
  const status = global.taskStatuses.get(taskId) || { status: 'not_found' };
  return NextResponse.json(status);
}
