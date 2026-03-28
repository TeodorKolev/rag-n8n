"""
Embedding generation service using OpenAI and other models
"""

import logging
import asyncio
from collections import OrderedDict
from typing import List, Optional, Dict, Any
import openai
from sentence_transformers import SentenceTransformer
import numpy as np

logger = logging.getLogger(__name__)

_CACHE_MAX_SIZE = 1000


class _LRUCache:
    """Bounded LRU cache — evicts the least-recently-used entry when full."""

    def __init__(self, maxsize: int) -> None:
        self._cache: OrderedDict = OrderedDict()
        self._maxsize = maxsize

    def get(self, key: str):
        if key not in self._cache:
            return None
        self._cache.move_to_end(key)
        return self._cache[key]

    def set(self, key: str, value) -> None:
        if key in self._cache:
            self._cache.move_to_end(key)
        else:
            if len(self._cache) >= self._maxsize:
                self._cache.popitem(last=False)  # evict LRU
        self._cache[key] = value

    def clear(self) -> None:
        self._cache.clear()

    def __len__(self) -> int:
        return len(self._cache)


class EmbeddingService:
    """Service for generating text embeddings"""
    
    def __init__(self, openai_api_key: str, model_name: str = "text-embedding-ada-002"):
        self.openai_api_key = openai_api_key
        self.model_name = model_name
        self.openai_client = None
        self.sentence_transformer = None
        
        # Initialize OpenAI client
        if openai_api_key:
            openai.api_key = openai_api_key
            self.openai_client = openai.OpenAI(api_key=openai_api_key)
        
        # ── Fix #8: bounded LRU cache — prevents unbounded memory growth ──────
        self.embedding_cache = _LRUCache(_CACHE_MAX_SIZE)
        
        logger.info(f"Initialized EmbeddingService with model: {model_name}")
    
    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        
        if not text.strip():
            raise ValueError("Cannot generate embedding for empty text")
        
        # Check cache first
        cache_key = f"{self.model_name}:{hash(text)}"
        cached = self.embedding_cache.get(cache_key)
        if cached is not None:
            logger.debug("Using cached embedding")
            return cached
        
        try:
            if self.model_name.startswith("text-embedding"):
                # Use OpenAI embedding
                embedding = await self._generate_openai_embedding(text)
            else:
                # Use sentence transformers
                embedding = await self._generate_sentence_transformer_embedding(text)
            
            # Cache the embedding
            self.embedding_cache.set(cache_key, embedding)
            
            return embedding
            
        except Exception as e:
            logger.error(f"Error generating embedding for text: {e}")
            raise
    
    async def generate_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts efficiently"""
        
        if not texts:
            return []
        
        # Filter out empty texts
        valid_texts = [(i, text) for i, text in enumerate(texts) if text.strip()]
        
        if not valid_texts:
            raise ValueError("No valid texts provided for embedding generation")
        
        try:
            if self.model_name.startswith("text-embedding"):
                # Use OpenAI batch embedding
                embeddings = await self._generate_openai_embeddings_batch([text for _, text in valid_texts])
            else:
                # Use sentence transformers batch
                embeddings = await self._generate_sentence_transformer_embeddings_batch([text for _, text in valid_texts])
            
            # Map embeddings back to original indices
            result = [[] for _ in range(len(texts))]
            for (original_idx, _), embedding in zip(valid_texts, embeddings):
                result[original_idx] = embedding
            
            return result
            
        except Exception as e:
            logger.error(f"Error generating batch embeddings: {e}")
            raise
    
    async def _generate_openai_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI API"""
        
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized")
        
        try:
            # Clean text for OpenAI API
            cleaned_text = text.replace("\n", " ").strip()
            
            response = await asyncio.to_thread(
                self.openai_client.embeddings.create,
                input=cleaned_text,
                model=self.model_name
            )
            
            embedding = response.data[0].embedding
            
            logger.debug(f"Generated OpenAI embedding with {len(embedding)} dimensions")
            return embedding
            
        except Exception as e:
            logger.error(f"Error calling OpenAI API: {e}")
            raise
    
    async def _generate_openai_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate multiple embeddings using OpenAI API batch processing"""
        
        if not self.openai_client:
            raise ValueError("OpenAI client not initialized")
        
        try:
            # Clean texts for OpenAI API
            cleaned_texts = [text.replace("\n", " ").strip() for text in texts]
            
            response = await asyncio.to_thread(
                self.openai_client.embeddings.create,
                input=cleaned_texts,
                model=self.model_name
            )
            
            embeddings = [item.embedding for item in response.data]
            
            logger.debug(f"Generated {len(embeddings)} OpenAI embeddings")
            return embeddings
            
        except Exception as e:
            logger.error(f"Error calling OpenAI API for batch embeddings: {e}")
            raise
    
    async def _generate_sentence_transformer_embedding(self, text: str) -> List[float]:
        """Generate embedding using sentence transformers"""
        
        if not self.sentence_transformer:
            self.sentence_transformer = SentenceTransformer(self.model_name)
        
        try:
            embedding = await asyncio.to_thread(
                self.sentence_transformer.encode,
                text,
                convert_to_numpy=True
            )
            
            # Convert to list
            embedding_list = embedding.tolist()
            
            logger.debug(f"Generated sentence transformer embedding with {len(embedding_list)} dimensions")
            return embedding_list
            
        except Exception as e:
            logger.error(f"Error generating sentence transformer embedding: {e}")
            raise
    
    async def _generate_sentence_transformer_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate multiple embeddings using sentence transformers batch processing"""
        
        if not self.sentence_transformer:
            self.sentence_transformer = SentenceTransformer(self.model_name)
        
        try:
            embeddings = await asyncio.to_thread(
                self.sentence_transformer.encode,
                texts,
                convert_to_numpy=True,
                batch_size=32
            )
            
            # Convert to list of lists
            embeddings_list = embeddings.tolist()
            
            logger.debug(f"Generated {len(embeddings_list)} sentence transformer embeddings")
            return embeddings_list
            
        except Exception as e:
            logger.error(f"Error generating sentence transformer batch embeddings: {e}")
            raise
    
    def get_embedding_dimensions(self) -> int:
        """Get the dimensions of embeddings for this model"""
        
        if self.model_name == "text-embedding-ada-002":
            return 1536
        elif self.model_name == "text-embedding-3-small":
            return 1536
        elif self.model_name == "text-embedding-3-large":
            return 3072
        else:
            # For sentence transformers, we need to load the model to get dimensions
            if not self.sentence_transformer:
                self.sentence_transformer = SentenceTransformer(self.model_name)
            return self.sentence_transformer.get_sentence_embedding_dimension()
    
    def calculate_similarity(self, embedding1: List[float], embedding2: List[float]) -> float:
        """Calculate cosine similarity between two embeddings"""
        
        if len(embedding1) != len(embedding2):
            raise ValueError("Embeddings must have the same dimensions")
        
        # Convert to numpy arrays
        vec1 = np.array(embedding1)
        vec2 = np.array(embedding2)
        
        # Calculate cosine similarity
        dot_product = np.dot(vec1, vec2)
        norm1 = np.linalg.norm(vec1)
        norm2 = np.linalg.norm(vec2)
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        similarity = dot_product / (norm1 * norm2)
        return float(similarity)
    
    def clear_cache(self):
        """Clear the embedding cache"""
        self.embedding_cache.clear()
        logger.info("Embedding cache cleared")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get statistics about the embedding cache"""
        return {
            "cache_size": len(self.embedding_cache),
            "cache_max_size": _CACHE_MAX_SIZE,
            "model_name": self.model_name,
            "embedding_dimensions": self.get_embedding_dimensions(),
        }
