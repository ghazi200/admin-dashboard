/**
 * Operational Data RAG Service
 * 
 * Phase 2: RAG (Retrieval-Augmented Generation) for operational data
 * Allows natural language queries over incidents, shifts, callouts, inspections, etc.
 * 
 * Features:
 * - Embed operational events and summaries
 * - Vector similarity search
 * - Context-aware answers with citations
 */

const { Op } = require("sequelize");

// Check if OpenAI is available
const OpenAI = require('openai').default;
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

/**
 * Embed text using OpenAI
 * @param {String} text - Text to embed
 * @returns {Promise<Array>} Embedding vector
 */
async function embedText(text) {
  if (!openai) {
    return null;
  }

  try {
    const response = await openai.embeddings.create({
      model: process.env.EMBEDDING_MODEL || "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("❌ Error creating embedding:", error.message);
    return null;
  }
}

/**
 * Chunk operational data for embedding
 * @param {Object} data - Operational event or summary
 * @returns {String} Chunked text ready for embedding
 */
function chunkOperationalData(data) {
  const parts = [];

  if (data.type) parts.push(`Type: ${data.type}`);
  if (data.severity) parts.push(`Severity: ${data.severity}`);
  if (data.title) parts.push(`Title: ${data.title}`);
  if (data.summary) parts.push(`Summary: ${data.summary}`);
  if (data.description) parts.push(`Description: ${data.description}`);
  if (data.location_text) parts.push(`Location: ${data.location_text}`);
  if (data.shift_date) parts.push(`Shift Date: ${data.shift_date}`);
  if (data.shift_start) parts.push(`Shift Time: ${data.shift_start} - ${data.shift_end}`);
  if (data.reported_at) parts.push(`Reported: ${new Date(data.reported_at).toLocaleString()}`);
  if (data.ai_summary) parts.push(`AI Analysis: ${data.ai_summary}`);

  return parts.join("\n");
}

/**
 * Store operational data chunk with embedding
 * @param {Object} data - Operational data to store
 * @param {String} dataType - Type of data (incident, shift, callout, etc.)
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @returns {Promise<Object>} Stored chunk
 */
async function storeOperationalChunk(data, dataType, tenantId, models) {
  try {
    // For now, we'll store chunks in OpEvent.ai_tags or a new table
    // In a full implementation, you'd create an operational_data_chunks table
    
    const chunkText = chunkOperationalData(data);
    const embedding = await embedText(chunkText);

    // Store in OpEvent if it's an event, or create a summary chunk
    return {
      chunkText,
      embedding,
      metadata: {
        dataType,
        tenantId,
        entityId: data.id,
        timestamp: data.created_at || data.reported_at || new Date(),
      },
    };
  } catch (error) {
    console.error("❌ Error storing operational chunk:", error.message);
    return null;
  }
}

/**
 * Query operational data using RAG
 * @param {String} question - Natural language question
 * @param {String} tenantId - Tenant ID
 * @param {Object} models - Sequelize models
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Answer with citations
 */
async function queryOperationalData(question, tenantId, models, options = {}) {
  const limit = options.limit || 10;

  try {
    // Check if models object is valid
    if (!models) {
      console.warn("⚠️ Models object not provided");
      return {
        answer: "Unable to query operational data. Models not available.",
        sources: [],
        confidence: 0,
      };
    }

    const { OpEvent } = models;
    if (!OpEvent) {
      console.warn("⚠️ OpEvent model not found in models");
      return {
        answer: "Operational data querying is not available. OpEvent model not found.",
        sources: [],
        confidence: 0,
      };
    }

    // Step 1: Get relevant operational events
    // Expand time range if no events found (up to 30 days)
    let timeRange = options.startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Start with 7 days
    let events = await OpEvent.findAll({
      where: {
        tenant_id: tenantId,
        created_at: {
          [Op.gte]: timeRange,
        },
      },
      order: [["created_at", "DESC"]],
      limit: 100, // Get more for context
    });

    // If no events found in 7 days, try 30 days
    if (events.length === 0) {
      timeRange = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      events = await OpEvent.findAll({
        where: {
          tenant_id: tenantId,
          created_at: {
            [Op.gte]: timeRange,
          },
        },
        order: [["created_at", "DESC"]],
        limit: 100,
      });
    }

    console.log(`📊 Found ${events.length} OpEvents for query: "${question}"`);

    // Step 1.5: If no OpEvents, query incidents and callouts directly as fallback
    if (events.length === 0) {
      console.log("⚠️ No OpEvents found, querying incidents and callouts directly...");
      
      const allData = [];

      // Get incidents (if model exists)
      if (models.Incident) {
        try {
          const incidents = await models.Incident.findAll({
            where: {
              tenantId: tenantId,
              reportedAt: {
                [Op.gte]: timeRange,
              },
            },
            order: [["reportedAt", "DESC"]],
            limit: 50,
            raw: true,
          });

          // Convert incidents to event-like format
          incidents.forEach(incident => {
            allData.push({
              type: "INCIDENT",
              severity: incident.severity || "MEDIUM",
              title: `Incident: ${incident.type || 'Unknown'}`,
              summary: incident.description || incident.aiSummary || "",
              created_at: incident.reportedAt || incident.createdAt,
              entity_refs: { incident_id: incident.id },
            });
          });
          console.log(`📋 Found ${incidents.length} incidents`);
        } catch (err) {
          console.warn("⚠️ Error querying incidents:", err.message);
        }
      }

      // Get callouts (if model exists)
      if (models.CallOut) {
        try {
          const callouts = await models.CallOut.findAll({
            where: {
              tenant_id: tenantId,
              created_at: {
                [Op.gte]: timeRange,
              },
            },
            order: [["created_at", "DESC"]],
            limit: 50,
          });

          // Convert callouts to event-like format
          callouts.forEach(callout => {
            allData.push({
              type: "CALLOUT",
              severity: "MEDIUM",
              title: "Guard Callout",
              summary: `Guard called out${callout.reason ? `: ${callout.reason}` : ''}`,
              created_at: callout.created_at,
              entity_refs: { callout_id: callout.id, guard_id: callout.guard_id },
            });
          });
          console.log(`📞 Found ${callouts.length} callouts`);
        } catch (err) {
          console.warn("⚠️ Error querying callouts:", err.message);
        }
      }

      // Use direct data as events
      if (allData.length > 0) {
        events = allData;
        console.log(`✅ Using ${events.length} direct records (incidents + callouts)`);
      }
    }

    // Step 2: If OpenAI available, use vector similarity search
    if (openai) {
      try {
        const questionEmbedding = await embedText(question);
        
        if (questionEmbedding) {
          // For now, use keyword matching + OpenAI for answer generation
          // Full vector search would require operational_data_chunks table with pgvector
          
          // Find relevant events using keyword matching
          const relevantEvents = events.filter(event => {
            const eventText = `${event.title} ${event.summary} ${event.type} ${event.severity}`.toLowerCase();
            const questionLower = question.toLowerCase();
            const keywords = questionLower.split(/\s+/).filter(w => w.length > 3);
            return keywords.some(keyword => eventText.includes(keyword));
          }).slice(0, limit);

          // Generate AI answer from relevant events
          const answer = await generateAnswerFromContext(question, relevantEvents);
          return answer;
        }
      } catch (embedError) {
        console.warn("⚠️ Embedding search failed, using keyword search:", embedError.message);
      }
    }

    // Step 3: Fallback to keyword search (more lenient)
    const questionLower = question.toLowerCase();
    // Extract keywords - include shorter words and common terms
    let keywords = questionLower
      .split(/\s+/)
      .filter(w => w.length > 2) // Include 3+ character words
      .filter(w => !['the', 'and', 'or', 'for', 'was', 'did', 'are', 'why', 'what', 'when', 'where', 'how'].includes(w));
    
    // If no keywords, use the whole question
    if (keywords.length === 0) {
      keywords = [questionLower];
    }
    
    console.log(`🔍 Searching with keywords:`, keywords);
    
    const relevantEvents = events.filter(event => {
      const eventText = `${event.title || ''} ${event.summary || ''} ${event.type || ''} ${event.severity || ''}`.toLowerCase();
      // Match if any keyword appears OR if question is generic (like "what happened")
      return keywords.some(keyword => eventText.includes(keyword)) || 
             (questionLower.includes('what') && events.length > 0) ||
             (questionLower.includes('any') && events.length > 0) ||
             (questionLower.includes('all') && events.length > 0);
    }).slice(0, limit);

    console.log(`✅ Found ${relevantEvents.length} relevant events`);

    // Generate simple answer from relevant events
    return generateSimpleAnswer(question, relevantEvents);
  } catch (error) {
    console.error("❌ Error querying operational data:", error.message);
    return {
      answer: "Unable to query operational data. Please try again later.",
      citations: [],
      confidence: 0.5,
    };
  }
}

/**
 * Generate AI answer from context events
 * @param {String} question
 * @param {Array} events - Relevant events
 * @returns {Promise<Object>} Answer with citations
 */
async function generateAnswerFromContext(question, events) {
  if (!openai || events.length === 0) {
    return generateSimpleAnswer(question, events);
  }

  try {
    const context = events.map((e, idx) => ({
      index: idx + 1,
      type: e.type,
      severity: e.severity,
      title: e.title,
      summary: e.summary || e.title,
      timestamp: e.created_at,
    }));

    const prompt = `You are an operations center analyst. Answer the following question based on the provided operational data.

**Question:** ${question}

**Relevant Operational Events:**
${JSON.stringify(context, null, 2)}

Provide your answer as JSON:
{
  "answer": "Clear, concise answer to the question based on the events",
  "confidence": 0.85,
  "sources": [1, 2] // Event indices that support the answer
}

**Important:**
- Be specific and cite event numbers
- If the question cannot be answered from the events, say so
- Return ONLY valid JSON, no markdown formatting`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert operations analyst. Provide clear, accurate answers based on operational data. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content || "{}";
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/) || responseText.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : responseText.trim();
    const aiResponse = JSON.parse(jsonText);

    // Build citations
    const citations = (aiResponse.sources || []).map(idx => {
      const event = events[idx - 1];
      if (!event) return null;
      return {
        type: event.type,
        title: event.title,
        timestamp: event.created_at,
        link: `/incidents/${event.entity_refs?.incident_id || event.id}`,
      };
    }).filter(Boolean);

    return {
      answer: aiResponse.answer || "Unable to generate answer from provided data.",
      citations,
      confidence: aiResponse.confidence || 0.7,
      sources: events.length,
    };
  } catch (error) {
    console.error("❌ Error generating AI answer:", error.message);
    return generateSimpleAnswer(question, events);
  }
}

/**
 * Generate simple answer without AI (fallback)
 * @param {String} question
 * @param {Array} events
 * @returns {Object} Simple answer
 */
function generateSimpleAnswer(question, events) {
  if (events.length === 0) {
    // More helpful message with suggestions
    return {
      answer: "No relevant operational data found to answer your question. This could mean:\n\n• No events have been recorded yet\n• Try asking more general questions like:\n  - \"What incidents occurred?\"\n  - \"Show me recent callouts\"\n  - \"What happened today?\"\n  - \"Any high-risk shifts?\"\n\nIf events exist, they may be outside the current time range. Try again after some operational activity.",
      citations: [],
      confidence: 0.3,
    };
  }

  // Simple keyword-based answer
  const questionLower = question.toLowerCase();
  let answer = "Based on the operational data:\n\n";

  if (questionLower.includes("incident") || questionLower.includes("what happened")) {
    const incidents = events.filter(e => e.type === "INCIDENT");
    if (incidents.length > 0) {
      answer += `There have been ${incidents.length} incident${incidents.length > 1 ? "s" : ""}:\n`;
      incidents.slice(0, 3).forEach((inc, idx) => {
        answer += `${idx + 1}. ${inc.title} (${inc.severity}) - ${new Date(inc.created_at).toLocaleDateString()}\n`;
      });
    }
  }

  if (questionLower.includes("callout") || questionLower.includes("who called")) {
    const callouts = events.filter(e => e.type === "CALLOUT");
    if (callouts.length > 0) {
      answer += `\nThere have been ${callouts.length} callout${callouts.length > 1 ? "s" : ""}.\n`;
    }
  }

  if (questionLower.includes("risk") || questionLower.includes("problem")) {
    const highRisk = events.filter(e => e.severity === "HIGH" || e.severity === "CRITICAL");
    if (highRisk.length > 0) {
      answer += `\n${highRisk.length} high-priority event${highRisk.length > 1 ? "s" : ""} require attention.\n`;
    }
  }

  const citations = events.slice(0, 5).map(e => ({
    type: e.type,
    title: e.title,
    timestamp: e.created_at,
  }));

  return {
    answer: answer.trim() || "I found relevant data but cannot generate a specific answer. Please try asking a more specific question.",
    citations,
    confidence: 0.6,
    sources: events.length,
  };
}

module.exports = {
  embedText,
  chunkOperationalData,
  storeOperationalChunk,
  queryOperationalData,
  generateAnswerFromContext,
};
