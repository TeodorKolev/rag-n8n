"""
Pinecone vector database service for storing and querying embeddings
"""

import logging
import asyncio
from typing import List, Dict, Any, Optional
import pinecone
from pinecone import Pinecone, ServerlessSpec

logger = logging.getLogger(__name__)


class PineconeService:
    """Service for interacting with Pinecone vector database"""
    
    def __init__(self, api_key: str, environment: str, index_name: str):
        self.api_key = api_key
        self.environment = environment
        self.index_name = index_name
        self.client = None
        self.index = None
        
        logger.info(f"Initializing PineconeService with index: {index_name}")
    
    async def initialize(self):
        """Initialize Pinecone client and index"""
        
        try:
            # Initialize Pinecone client
            self.client = Pinecone(api_key=self.api_key)
            
            # Check if index exists, create if not
            await self._ensure_index_exists()
            
            # Get index reference
            self.index = self.client.Index(self.index_name)
            
            logger.info(f"Successfully connected to Pinecone index: {self.index_name}")
            
        except Exception as e:
            logger.error(f"Error initializing Pinecone: {e}")
            raise
    
    async def _ensure_index_exists(self):
        """Ensure the Pinecone index exists, create if not"""
        
        try:
            # List existing indexes
            existing_indexes = await asyncio.to_thread(self.client.list_indexes)
            index_names = [idx.name for idx in existing_indexes.indexes]
            
            if self.index_name in index_names:
                # Check if existing index has correct dimensions
                try:
                    index_stats = await asyncio.to_thread(self.client.describe_index, self.index_name)
                    if index_stats.dimension != 1536:
                        logger.info(f"Deleting existing index with wrong dimensions: {self.index_name}")
                        await asyncio.to_thread(self.client.delete_index, self.index_name)
                        # Wait for deletion to complete
                        await asyncio.sleep(10)
                        index_names.remove(self.index_name)
                except Exception as e:
                    logger.warning(f"Could not check index dimensions, will recreate: {e}")
                    await asyncio.to_thread(self.client.delete_index, self.index_name)
                    await asyncio.sleep(10)
                    index_names.remove(self.index_name)
            
            if self.index_name not in index_names:
                logger.info(f"Creating Pinecone index: {self.index_name}")
                
                # Create index with default settings for sentence-transformers
                await asyncio.to_thread(
                    self.client.create_index,
                    name=self.index_name,
                    dimension=1536,  # OpenAI text-embedding-ada-002
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud="aws",
                        region="us-east-1"
                    )
                )
                
                logger.info(f"Created Pinecone index: {self.index_name}")
            else:
                logger.info(f"Pinecone index already exists: {self.index_name}")
                
        except Exception as e:
            logger.error(f"Error ensuring index exists: {e}")
            raise
    
    async def upsert_vectors(self, vectors: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Upsert vectors to Pinecone index"""
        
        if not vectors:
            raise ValueError("No vectors provided for upsert")
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            # Validate vector format
            for vector in vectors:
                if not all(key in vector for key in ['id', 'values', 'metadata']):
                    raise ValueError("Each vector must have 'id', 'values', and 'metadata' fields")
            
            # Upsert vectors in batches
            batch_size = 100
            total_upserted = 0
            
            for i in range(0, len(vectors), batch_size):
                batch = vectors[i:i + batch_size]
                
                response = await asyncio.to_thread(
                    self.index.upsert,
                    vectors=batch
                )
                
                total_upserted += response.upserted_count
                logger.debug(f"Upserted batch {i // batch_size + 1}: {response.upserted_count} vectors")
            
            logger.info(f"Successfully upserted {total_upserted} vectors to Pinecone")
            
            return {
                "upserted_count": total_upserted,
                "total_vectors": len(vectors)
            }
            
        except Exception as e:
            logger.error(f"Error upserting vectors to Pinecone: {e}")
            raise
    
    async def query_similar(
        self, 
        vector: List[float], 
        top_k: int = 5, 
        department_filter: Optional[str] = None,
        source_filter: Optional[str] = None,
        include_metadata: bool = True
    ) -> Any:
        """Query for similar vectors in Pinecone"""
        
        if not vector:
            raise ValueError("Query vector cannot be empty")
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            # Build filter
            filter_dict = {}
            if department_filter:
                filter_dict["department"] = department_filter
            if source_filter:
                filter_dict["source"] = source_filter
            
            # Query Pinecone
            response = await asyncio.to_thread(
                self.index.query,
                vector=vector,
                top_k=top_k,
                include_metadata=include_metadata,
                filter=filter_dict if filter_dict else None
            )
            
            logger.debug(f"Found {len(response.matches)} similar vectors")
            
            return response
            
        except Exception as e:
            logger.error(f"Error querying Pinecone: {e}")
            raise
    
    async def delete_by_document_id(self, document_id: str) -> Dict[str, Any]:
        """Delete all vectors for a specific document"""
        
        if not document_id:
            raise ValueError("Document ID cannot be empty")
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            # Delete vectors with matching document_id in metadata
            response = await asyncio.to_thread(
                self.index.delete,
                filter={"document_id": document_id}
            )
            
            logger.info(f"Deleted vectors for document: {document_id}")
            
            return {"deleted_document_id": document_id}
            
        except Exception as e:
            logger.error(f"Error deleting vectors for document {document_id}: {e}")
            raise
    
    async def delete_by_ids(self, vector_ids: List[str]) -> Dict[str, Any]:
        """Delete specific vectors by their IDs"""
        
        if not vector_ids:
            raise ValueError("No vector IDs provided")
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            # Delete vectors by IDs
            await asyncio.to_thread(
                self.index.delete,
                ids=vector_ids
            )
            
            logger.info(f"Deleted {len(vector_ids)} vectors by ID")
            
            return {"deleted_count": len(vector_ids)}
            
        except Exception as e:
            logger.error(f"Error deleting vectors by IDs: {e}")
            raise
    
    async def get_index_stats(self) -> Dict[str, Any]:
        """Get statistics about the Pinecone index"""
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            stats = await asyncio.to_thread(self.index.describe_index_stats)
            
            return {
                "total_vector_count": stats.total_vector_count,
                "dimension": stats.dimension,
                "index_fullness": stats.index_fullness,
                "namespaces": stats.namespaces
            }
            
        except Exception as e:
            logger.error(f"Error getting index stats: {e}")
            raise
    
    async def fetch_vectors(self, vector_ids: List[str]) -> Dict[str, Any]:
        """Fetch specific vectors by their IDs"""
        
        if not vector_ids:
            raise ValueError("No vector IDs provided")
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            response = await asyncio.to_thread(
                self.index.fetch,
                ids=vector_ids
            )
            
            logger.debug(f"Fetched {len(response.vectors)} vectors")
            
            return response
            
        except Exception as e:
            logger.error(f"Error fetching vectors: {e}")
            raise
    
    async def update_vector_metadata(self, vector_id: str, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Update metadata for a specific vector"""
        
        if not vector_id:
            raise ValueError("Vector ID cannot be empty")
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            await asyncio.to_thread(
                self.index.update,
                id=vector_id,
                set_metadata=metadata
            )
            
            logger.debug(f"Updated metadata for vector: {vector_id}")
            
            return {"updated_vector_id": vector_id, "metadata": metadata}
            
        except Exception as e:
            logger.error(f"Error updating vector metadata: {e}")
            raise
    
    async def list_vectors(self, prefix: Optional[str] = None, limit: int = 100) -> List[str]:
        """List vector IDs in the index"""
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            # Note: This is a simplified implementation
            # Pinecone doesn't have a direct list_vectors method
            # You might need to implement this based on your specific needs
            
            logger.warning("list_vectors is not directly supported by Pinecone")
            return []
            
        except Exception as e:
            logger.error(f"Error listing vectors: {e}")
            raise
    
    async def clear_index(self) -> Dict[str, Any]:
        """Clear all vectors from the index (use with caution!)"""
        
        if not self.index:
            raise ValueError("Pinecone index not initialized")
        
        try:
            # Delete all vectors
            await asyncio.to_thread(
                self.index.delete,
                delete_all=True
            )
            
            logger.warning("Cleared all vectors from Pinecone index")
            
            return {"message": "Index cleared successfully"}
            
        except Exception as e:
            logger.error(f"Error clearing index: {e}")
            raise
    
    def is_initialized(self) -> bool:
        """Check if the service is properly initialized"""
        return self.client is not None and self.index is not None
