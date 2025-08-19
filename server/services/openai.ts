import OpenAI from "openai";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_ENV_VAR || "default_key"
});

export interface ProductContentRequest {
  productName: string;
  category?: string;
  keyFeatures?: string;
  brandVoice?: string;
  targetAudience?: string;
}

export interface GeneratedContent {
  title: string;
  description: string;
  seoTitle: string;
  metaDescription: string;
  bullets: string[];
  tags: string[];
}

export async function generateProductContent(request: ProductContentRequest): Promise<GeneratedContent> {
  try {
    const prompt = `
You are an expert e-commerce copywriter. Generate comprehensive product content for the following product:

Product Name: ${request.productName}
Category: ${request.category || 'General'}
Key Features: ${request.keyFeatures || 'Not specified'}
Brand Voice: ${request.brandVoice || 'Professional and engaging'}
Target Audience: ${request.targetAudience || 'General consumers'}

Generate the following content in JSON format:
{
  "title": "Optimized product title (60 characters max)",
  "description": "Detailed product description (200-300 words)",
  "seoTitle": "SEO-optimized title for search engines",
  "metaDescription": "Meta description for SEO (150-160 characters)",
  "bullets": ["5-7 key selling points as bullet points"],
  "tags": ["10-15 relevant tags for categorization and search"]
}

Ensure the content is compelling, accurate, and optimized for e-commerce conversion.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce copywriter specializing in product descriptions and SEO optimization. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate the response structure
    if (!result.title || !result.description || !result.bullets || !result.tags) {
      throw new Error("Invalid response structure from OpenAI");
    }

    return result as GeneratedContent;
  } catch (error) {
    console.error("Error generating product content:", error);
    throw new Error(`Failed to generate content: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export interface MarketingFramework {
  name: string;
  description: string;
  structure: string;
}

export const MARKETING_FRAMEWORKS: MarketingFramework[] = [
  {
    name: "AIDA",
    description: "Attention, Interest, Desire, Action - Classic conversion framework",
    structure: "Hook attention → Build interest → Create desire → Drive action"
  },
  {
    name: "PAS",
    description: "Problem, Agitation, Solution - Pain point focused approach",
    structure: "Identify problem → Agitate pain → Present solution"
  },
  {
    name: "Features-Benefits-Advantages",
    description: "Technical specs translated to customer value",
    structure: "What it has → What it does → Why it matters"
  },
  {
    name: "Before-After-Bridge",
    description: "Transformation-focused storytelling",
    structure: "Current state → Desired state → How product bridges gap"
  },
  {
    name: "STAR",
    description: "Situation, Task, Action, Result - Problem-solving narrative",
    structure: "Customer situation → Task needed → Product action → Result achieved"
  }
];

export interface ProductDescriptionRequest {
  productName: string;
  currentDescription?: string;
  features?: string;
  benefits?: string;
  targetAudience?: string;
  framework: string;
  brandVoice?: string;
  price?: string;
  category?: string;
  upc?: string;
  variants?: any[];
}

export async function generateMarketingDescription(request: ProductDescriptionRequest): Promise<{
  description: string;
  framework: string;
  bullets: string[];
  cta: string;
  seoKeywords: string[];
}> {
  try {
    const frameworkInstructions = getFrameworkInstructions(request.framework);
    
    const prompt = `
You are a world-class e-commerce copywriter and marketing expert. Generate a compelling product description using the ${request.framework} marketing framework.

PRODUCT INFORMATION:
- Name: ${request.productName}
- Current Description: ${request.currentDescription || 'None provided'}
- Key Features: ${request.features || 'Extract from current description'}
- Benefits: ${request.benefits || 'Derive from features'}
- Target Audience: ${request.targetAudience || 'General consumers'}
- Brand Voice: ${request.brandVoice || 'Professional and persuasive'}
- Price: ${request.price || 'Not specified'}
- Category: ${request.category || 'General'}
- UPC: ${request.upc || 'Not specified'}
- Variants: ${request.variants ? `${request.variants.length} variants available` : 'Single variant'}

FRAMEWORK: ${request.framework}
${frameworkInstructions}

Generate a response in JSON format:
{
  "description": "Complete marketing-focused product description (250-350 words) using the ${request.framework} framework",
  "framework": "${request.framework}",
  "bullets": ["5-7 compelling bullet points highlighting key benefits"],
  "cta": "Strong call-to-action phrase",
  "seoKeywords": ["10-15 SEO-optimized keywords for this product"]
}

Requirements:
- Use persuasive, conversion-focused language
- Include emotional triggers and urgency where appropriate
- Focus on customer benefits, not just features
- Make it scannable with good flow and rhythm
- Incorporate social proof elements if possible
- Ensure the description follows the chosen marketing framework structure
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce copywriter and marketing strategist specializing in conversion optimization. Always respond with valid JSON and use proven marketing frameworks."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
      max_tokens: 1000,
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    if (!result.description || !result.bullets || !result.cta) {
      throw new Error("Invalid response structure from OpenAI");
    }

    return result;
  } catch (error) {
    console.error("Error generating marketing description:", error);
    throw new Error(`Failed to generate description: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function getFrameworkInstructions(framework: string): string {
  switch (framework) {
    case "AIDA":
      return `
AIDA Structure:
1. ATTENTION: Start with a compelling hook that grabs attention immediately
2. INTEREST: Build interest by highlighting unique features or benefits
3. DESIRE: Create desire by showing how the product solves problems or improves life
4. ACTION: End with a clear call-to-action that drives purchase`;

    case "PAS":
      return `
PAS Structure:
1. PROBLEM: Identify the specific problem or pain point your target audience faces
2. AGITATION: Make the problem feel urgent and costly to ignore
3. SOLUTION: Present your product as the perfect solution to resolve their pain`;

    case "Features-Benefits-Advantages":
      return `
FBA Structure:
1. FEATURES: What the product has (technical specifications, components)
2. BENEFITS: What the product does (functional outcomes, capabilities)
3. ADVANTAGES: Why it matters (emotional payoff, competitive edge, life improvement)`;

    case "Before-After-Bridge":
      return `
BAB Structure:
1. BEFORE: Paint a picture of the customer's current frustrating situation
2. AFTER: Show the ideal scenario after using your product
3. BRIDGE: Explain how your product is the bridge that gets them from Before to After`;

    case "STAR":
      return `
STAR Structure:
1. SITUATION: Describe a relatable customer situation or challenge
2. TASK: What needs to be accomplished or problem solved
3. ACTION: How your product takes action to address the task
4. RESULT: The positive outcome and benefits achieved`;

    default:
      return "Use a persuasive, benefit-focused approach that highlights customer value.";
  }
}

export async function generateProductDescription(productName: string, features: string): Promise<string> {
  // Legacy function - redirect to new marketing description generator
  const request: ProductDescriptionRequest = {
    productName,
    features,
    framework: "Features-Benefits-Advantages"
  };
  
  const result = await generateMarketingDescription(request);
  return result.description;
}

export async function optimizeProductTags(productName: string, category: string): Promise<string[]> {
  try {
    const prompt = `Generate 10-15 relevant tags for the product "${productName}" in the "${category}" category. 
    Return the response in JSON format: { "tags": ["tag1", "tag2", ...] }`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an SEO expert specializing in product tagging and categorization. Always respond with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
    });

    const result = JSON.parse(response.choices[0].message.content || '{"tags": []}');
    return result.tags || [];
  } catch (error) {
    console.error("Error generating product tags:", error);
    throw new Error(`Failed to generate tags: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
