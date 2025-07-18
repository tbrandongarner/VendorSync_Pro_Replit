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

export async function generateProductDescription(productName: string, features: string): Promise<string> {
  try {
    const prompt = `Write a compelling product description for "${productName}" with the following features: ${features}. 
    The description should be 2-3 paragraphs, engaging, and highlight the key benefits for customers.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert e-commerce copywriter. Write compelling product descriptions that convert browsers into buyers."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error("Error generating product description:", error);
    throw new Error(`Failed to generate description: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
