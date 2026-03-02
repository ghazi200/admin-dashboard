# DeepSeek AI Migration Guide

## Overview

This system now supports **DeepSeek** as the primary AI provider for chat completions, with **OpenAI as fallback**. This hybrid approach provides:

- **70-80% cost savings** on chat completions (DeepSeek is 5-10x cheaper)
- **OpenAI still used for embeddings** (DeepSeek doesn't offer embeddings)
- **Automatic fallback** if DeepSeek is unavailable
- **Zero code changes needed** - just environment variables

## Environment Variables

### Required Setup

Add these to your `.env` file:

```env
# Provider Selection (defaults to 'openai' if not set)
AI_PROVIDER=deepseek  # or 'openai'

# DeepSeek Configuration (for chat completions)
DEEPSEEK_API_KEY=sk-your-deepseek-key-here
DEEPSEEK_MODEL=deepseek-chat  # or 'deepseek-v3' for advanced reasoning

# OpenAI Configuration (for embeddings + fallback)
OPENAI_API_KEY=sk-your-openai-key-here
OPENAI_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small
```

### Getting DeepSeek API Key

1. Sign up at [platform.deepseek.com](https://platform.deepseek.com)
2. Navigate to API Keys section
3. Create a new API key
4. Copy the key to your `.env` file

## How It Works

### Chat Completions (DeepSeek Preferred)

The following services use DeepSeek when `AI_PROVIDER=deepseek`:

1. **Payroll AI** (`payrollAI.service.js`)
   - Explains pay stubs
   - Answers payroll questions
   - Falls back to structured responses if AI unavailable

2. **Incident AI** (`incidentAI.service.js`)
   - Analyzes incident reports
   - Generates summaries and timelines
   - Falls back to mock analysis if AI unavailable

3. **Command Center AI** (`commandCenterAI.service.js`)
   - Operational briefings
   - Risk analysis
   - Event tagging
   - Weekly summaries
   - Falls back to template-based responses if AI unavailable

### Embeddings (Always OpenAI)

The following service **always uses OpenAI** (DeepSeek doesn't offer embeddings):

- **Policy RAG** (`embeddings.service.js`)
  - Creates vector embeddings for policy documents
  - Uses `text-embedding-3-small` model
  - Falls back to keyword search if OpenAI unavailable

## Fallback Chain

For each AI service:

1. **Try DeepSeek** (if `AI_PROVIDER=deepseek` and `DEEPSEEK_API_KEY` set)
2. **Fallback to OpenAI** (if DeepSeek fails or not configured)
3. **Fallback to template/structured response** (if no AI available)

## Cost Comparison

### Example: 1,000 Payroll Queries/Month

| Provider | Input Tokens | Output Tokens | Monthly Cost |
|----------|-------------|---------------|--------------|
| OpenAI (gpt-4o-mini) | 500K | 200K | ~$5-10 |
| DeepSeek (deepseek-chat) | 500K | 200K | ~$1-2 |
| **Savings** | | | **80%** |

### Example: 10,000 Queries/Month

| Provider | Monthly Cost |
|----------|--------------|
| OpenAI | ~$50-100 |
| DeepSeek | ~$10-20 |
| **Savings** | **$40-80/month** |

## Testing

### Verify DeepSeek is Working

1. Set `AI_PROVIDER=deepseek` in `.env`
2. Set `DEEPSEEK_API_KEY=your-key`
3. Restart backend server
4. Test Payroll AI or Incident AI
5. Check logs for provider info:
   ```
   ✅ Using DeepSeek for chat completions
   ✅ Using OpenAI for embeddings
   ```

### Verify Fallback Works

1. Set invalid `DEEPSEEK_API_KEY`
2. Keep `OPENAI_API_KEY` valid
3. System should automatically fallback to OpenAI
4. Check logs for fallback message

## Monitoring

The system logs which provider is being used:

```javascript
// In payrollAI.service.js response
{
  answer: "...",
  usedAI: true,
  provider: "deepseek" // or "openai"
}
```

## Troubleshooting

### DeepSeek Not Working

1. **Check API key**: Ensure `DEEPSEEK_API_KEY` is set correctly
2. **Check provider**: Ensure `AI_PROVIDER=deepseek`
3. **Check logs**: Look for error messages
4. **Verify base URL**: Should be `https://api.deepseek.com` (handled automatically)

### Fallback Not Working

1. **Check OpenAI key**: Ensure `OPENAI_API_KEY` is still set
2. **Check error logs**: See what error DeepSeek returned
3. **Verify fallback logic**: Check `aiClient.js` utility

### Embeddings Not Working

- Embeddings **always use OpenAI** (DeepSeek doesn't offer this)
- Ensure `OPENAI_API_KEY` is set
- Check `EMBEDDING_MODEL` is correct

## Migration Checklist

- [x] Created `aiClient.js` utility
- [x] Updated `payrollAI.service.js`
- [x] Updated `incidentAI.service.js`
- [x] Updated `commandCenterAI.service.js`
- [x] Kept `embeddings.service.js` using OpenAI
- [ ] Add DeepSeek API key to `.env`
- [ ] Test with DeepSeek enabled
- [ ] Monitor costs and quality
- [ ] Adjust model if needed (`deepseek-chat` vs `deepseek-v3`)

## Model Selection

### `deepseek-chat` (Default)
- General purpose
- Good for most use cases
- Fast and cost-effective

### `deepseek-v3`
- Advanced reasoning
- Better for complex analysis
- Slightly more expensive but still much cheaper than GPT-4

### When to Use Which

- **deepseek-chat**: Payroll AI, basic incident analysis
- **deepseek-v3**: Command Center AI, complex risk analysis

Change via `DEEPSEEK_MODEL` environment variable.

## Support

For issues or questions:
1. Check logs for provider information
2. Verify environment variables
3. Test with OpenAI first to isolate issues
4. Check DeepSeek API status at [platform.deepseek.com](https://platform.deepseek.com)
