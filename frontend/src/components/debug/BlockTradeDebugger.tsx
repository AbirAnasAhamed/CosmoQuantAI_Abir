
import React, { useState } from 'react';
import {
    Box,
    Text,
    VStack,
    HStack,
    Badge,
    Table,
    Thead,
    Tbody,
    Tr,
    Th,
    Td,
    Container,
    Button,
    Input,
    useColorModeValue
} from '@chakra-ui/react';
import { useBlockTradeSocket } from '../../hooks/useBlockTradeSocket';
import { useBlockTradeConfig } from '../../hooks/useBlockTradeConfig';

const BlockTradeDebugger: React.FC = () => {
    const { trades, isConnected } = useBlockTradeSocket();
    const { config, updateConfig, isLoading } = useBlockTradeConfig();

    // Local state for config inputs
    const [minBlockValue, setMinBlockValue] = useState<string>('');
    const [whaleValue, setWhaleValue] = useState<string>('');

    const textColor = useColorModeValue('gray.800', 'white');
    const bgEvent = useColorModeValue('gray.50', 'gray.800');

    const handleUpdateConfig = () => {
        if (config) {
            updateConfig({
                min_block_value: minBlockValue ? parseFloat(minBlockValue) : config.min_block_value,
                whale_value: whaleValue ? parseFloat(whaleValue) : config.whale_value
            });
        }
    };

    return (
        <Container maxW="container.xl" py={5}>
            <VStack spacing={6} align="stretch">
                <Box p={5} shadow="md" borderWidth="1px" borderRadius="md" bg={bgEvent}>
                    <HStack justifyContent="space-between" mb={4}>
                        <Text fontSize="xl" fontWeight="bold" color={textColor}>
                            Block Trade Monitor Debugger
                        </Text>
                        <Badge colorScheme={isConnected ? 'green' : 'red'} fontSize="md" p={1}>
                            {isConnected ? 'Connected' : 'Disconnected'}
                        </Badge>
                    </HStack>

                    {config && (
                        <VStack align="start" spacing={3}>
                            <Text fontWeight="semibold">Current Config:</Text>
                            <HStack>
                                <Text>Min Block Value:</Text>
                                <Input
                                    size="sm"
                                    width="100px"
                                    placeholder={config.min_block_value.toString()}
                                    value={minBlockValue}
                                    onChange={(e) => setMinBlockValue(e.target.value)}
                                />
                                <Text>Whale Value:</Text>
                                <Input
                                    size="sm"
                                    width="100px"
                                    placeholder={config.whale_value.toString()}
                                    value={whaleValue}
                                    onChange={(e) => setWhaleValue(e.target.value)}
                                />
                                <Button
                                    size="sm"
                                    colorScheme="blue"
                                    isLoading={isLoading}
                                    onClick={handleUpdateConfig}
                                >
                                    Update Config
                                </Button>
                            </HStack>
                            <Text fontSize="sm" color="gray.500">
                                Active Exchanges: {config.active_exchanges.join(', ')}
                            </Text>
                        </VStack>
                    )}
                </Box>

                <Box overflowX="auto">
                    <Table variant="simple" size="sm">
                        <Thead>
                            <Tr>
                                <Th>Time</Th>
                                <Th>Exchange</Th>
                                <Th>Symbol</Th>
                                <Th>Side</Th>
                                <Th isNumeric>Price</Th>
                                <Th isNumeric>Amount</Th>
                                <Th isNumeric>Value ($)</Th>
                                <Th>Details</Th>
                            </Tr>
                        </Thead>
                        <Tbody>
                            {trades.map((trade, index) => (
                                <Tr key={`${trade.exchange}-${trade.timestamp}-${index}`}>
                                    <Td>{new Date(trade.timestamp).toLocaleTimeString()}</Td>
                                    <Td>{trade.exchange}</Td>
                                    <Td fontWeight="bold">{trade.symbol}</Td>
                                    <Td>
                                        <Badge colorScheme={trade.side === 'buy' ? 'green' : 'red'}>
                                            {trade.side.toUpperCase()}
                                        </Badge>
                                    </Td>
                                    <Td isNumeric>{trade.price.toLocaleString()}</Td>
                                    <Td isNumeric>{trade.amount.toFixed(4)}</Td>
                                    <Td isNumeric fontWeight="bold">
                                        ${trade.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </Td>
                                    <Td>
                                        {trade.is_whale && (
                                            <Badge colorScheme="purple">WHALE 🐳</Badge>
                                        )}
                                    </Td>
                                </Tr>
                            ))}
                            {trades.length === 0 && (
                                <Tr>
                                    <Td colSpan={8} textAlign="center">
                                        Waiting for block trades...
                                    </Td>
                                </Tr>
                            )}
                        </Tbody>
                    </Table>
                </Box>
            </VStack>
        </Container>
    );
};

export default BlockTradeDebugger;
