import React from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Link,
} from '@mui/material';
import { ExpandMore, Description, Link as LinkIcon } from '@mui/icons-material';
import { Source } from '../types';

interface MessageSourcesProps {
  sources: Source[];
}

const MessageSources: React.FC<MessageSourcesProps> = ({ sources }) => {
  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <Box mt={2}>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Sources:
      </Typography>
      {sources.map((source, index) => (
        <Accordion key={index}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1} width="100%">
              <Description fontSize="small" color="action" />
              <Typography variant="body2" noWrap>
                {source.title}
              </Typography>
              <Chip
                label={source.department}
                size="small"
                variant="outlined"
                sx={{ ml: 'auto' }}
              />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Source: {source.source}
              </Typography>
              {source.content && (
                <Typography variant="body2" paragraph>
                  {source.content}
                </Typography>
              )}
              <Box display="flex" alignItems="center" gap={1}>
                <LinkIcon fontSize="small" color="action" />
                <Link href={source.source} target="_blank" variant="body2">
                  View Document
                </Link>
              </Box>
            </Box>
          </AccordionDetails>
        </Accordion>
      ))}
    </Box>
  );
};

export default MessageSources;
