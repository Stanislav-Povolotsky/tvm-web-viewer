import React, { useCallback, useEffect, useState, useRef } from 'react';

import {
    ChakraProvider,
    Button,
    Center,
    Flex,
    Box,
    Input,
    Heading,
    InputGroup,
    InputRightElement,
    Modal,
    ModalOverlay,
    ModalContent,
    ModalHeader,
    ModalCloseButton,
    ModalBody,
    ModalFooter,
    Spinner,
    Text,
    Spacer,
    Grid,
    Link,
    Divider,
    useToast,
    Tooltip,
    TableContainer,
    Table,
    Tbody,
    Tr,
    Td,
    Icon,
    Card,
    CardHeader,
    CardBody,
    CardFooter,
    SimpleGrid,
    Thead,
    Th,
    Tfoot,
    TableCaption,
} from '@chakra-ui/react';
import { ExternalLinkIcon } from '@chakra-ui/icons';
import {
    Address,
    beginCell,
    Builder,
    Cell,
    fromNano,
    OutAction,
    Slice,
    storeMessageRelaxed,
} from '@ton/core';
import { getEmulationWithStack } from './runner/runner';
import { EmulateWithStackResult, StackElement } from './runner/types';
import { customStringify, linkToTx } from './runner/utils';
import { GithubIcon } from './icons/github';
import { TonIcon } from './icons/ton';
import theme from './theme';
import { DocsIcon } from './icons/docs';

type KeyPressHandler = () => void;
const OPCODES_JSON_URL =
    'https://raw.githubusercontent.com/ton-community/ton-docs/refs/heads/main/src/data/opcodes/opcodes.json';

const useGlobalKeyPress = (key: string, action: KeyPressHandler) => {
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === key) {
                action();
            }
        };

        window.addEventListener('keyup', handleKeyPress);

        return () => {
            window.removeEventListener('keyup', handleKeyPress);
        };
    }, [key, action]);
};

export const getQueryParam = (param: string) => {
    const queryParams = new URLSearchParams(window.location.search);
    return queryParams.get(param);
};

interface Opcode {
    name: string;
    alias_of: string;
    tlb: string;
    doc_category: string;
    doc_opcode: string;
    doc_fift: string;
    doc_stack: string;
    doc_gas: number | string;
    doc_description: string;
}

function App() {
    const txFromArg = decodeURIComponent(getQueryParam('tx') || '');
    const [testnet, setTestnet] = useState<boolean>(
        getQueryParam('testnet') === 'true'
    );

    const [link, setLink] = useState<string>(txFromArg);
    const [isErrorOpen, setIsErrorOpen] = useState(false);
    const [areLogsOpen, setAreLogsOpen] = useState(false);
    const [isC5Open, setIsC5Open] = useState(false);
    const [errorText, setErrorText] = useState('');
    const [emulationStatus, setEmulationStatus] = useState<string>('');
    const [emulationResult, setEmulationResult] = useState<
        EmulateWithStackResult | undefined
    >(undefined);
    const [processing, setProcessing] = useState(false);
    const [selectedStep, setSelectedStep] = useState<number>(0);
    const [isStackBefore, setIsStackBefore] = useState<boolean>(false);
    const [opcodes, setOpcodes] = useState<Opcode[]>([]);
    const [selectedOpcode, setSelectedOpcode] = useState<Opcode | null>(null);
    const [matchingOpcodes, setMatchingOpcodes] = useState<Opcode[]>([]);
    const [selectedOpcodeStackDiff, setSelectedOpcodeStackDiff] = useState<
        [number, number] | null
    >(null);
    const [maxDocWindowHeight, setMaxDocWindowHeight] = useState<number>(0);
    const docBoxRef = useRef<HTMLDivElement>(null);
    const [isHoveringStack, setIsHoveringStack] = useState(false);

    const updateURLWithTx = (tx: string) => {
        const encodedTx = encodeURIComponent(tx);
        const url = new URL(window.location.href);
        if (testnet) {
            url.searchParams.set('testnet', testnet.toString());
        }
        url.searchParams.set('tx', encodedTx);
        window.history.pushState({}, '', url.toString());
    };

    async function viewTransaction() {
        console.log('Viewing transaction:', link);
        setErrorText('');
        setEmulationResult(undefined);
        setProcessing(true);
        setEmulationStatus('Recognizing tx');
        try {
            const { tx, testnet: gotTestnet } = await linkToTx(link, testnet);
            setTestnet(gotTestnet);
            const emulation = await getEmulationWithStack(
                tx,
                gotTestnet,
                setEmulationStatus
            );
            setEmulationResult(emulation);
            updateURLWithTx(tx.hash.toString('hex') || '');
        } catch (e) {
            if (e instanceof Error) {
                setErrorText(e.message);
                setIsErrorOpen(true);
            }
            console.error(e);
        }
        setProcessing(false);
    }

    function onCloseErrorModal() {
        setIsErrorOpen(false);
        setErrorText('');
    }

    const toast = useToast();

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        toast({
            title: 'Copied to clipboard',
            status: 'success',
            duration: 3000,
            position: 'bottom-left',

            containerStyle: {
                background: 'green.600',
                rounded: '0',
                fontSize: '12',
            },
        });
    }, []);

    const prevStep = () => {
        if (selectedStep > 0) {
            setSelectedStep(selectedStep - 1);
            if (emulationResult) {
                const instruction =
                    emulationResult.computeLogs[selectedStep - 1].instruction;
                handleOpcodeClick(instruction);
            }
        }
    };

    useGlobalKeyPress('ArrowLeft', prevStep);

    const nextStep = () => {
        if (
            emulationResult &&
            selectedStep < emulationResult.computeLogs.length - 1
        ) {
            setSelectedStep(selectedStep + 1);
            const instruction =
                emulationResult.computeLogs[selectedStep + 1].instruction;
            handleOpcodeClick(instruction);
        }
    };
    useGlobalKeyPress('ArrowRight', nextStep);

    const loadOpcodesJson = useCallback(async () => {
        if (opcodes.length > 0) return;

        try {
            console.log('Loading opcodes json...');
            const response = await fetch(OPCODES_JSON_URL);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data: Opcode[] = await response.json();
            setOpcodes(data);
        } catch (error) {
            console.error('Error loading opcodes:', error);
        }
    }, [opcodes]);

    useEffect(() => {
        // load opcodes on first render
        loadOpcodesJson();
    }, []);

    const findOpcodeInfo = useCallback(
        (opcodeStr: string): Opcode | null => {
            if (!opcodeStr || opcodes.length === 0) return null;

            let normalizedStr = opcodeStr.trim();
            if (normalizedStr.startsWith('implicit ')) {
                normalizedStr = normalizedStr.slice(9).trim();
            }

            // split into command name and parameters
            const parts = normalizedStr.split(/\s+|,/);
            const commandName = parts[0].toUpperCase();

            const exactMatch = opcodes.find(
                (op) => op.name.toUpperCase() === commandName
            );
            if (exactMatch) return exactMatch;

            if (commandName === 'XCHG') {
                const params = parts.slice(1).filter((p) => p.startsWith('s'));
                if (params.length >= 2) {
                    const i = parseInt(params[0].substring(1));
                    const j = parseInt(params[1].substring(1));

                    if (!isNaN(i) && !isNaN(j)) {
                        if (i === 0) {
                            // XCHG_0I (s0,si)
                            return (
                                opcodes.find((op) => op.name === 'XCHG_0I') ||
                                null
                            );
                        } else if (i === 1) {
                            // XCHG_1I (s1,si where i >= 2)
                            if (j >= 2) {
                                return (
                                    opcodes.find(
                                        (op) => op.name === 'XCHG_1I'
                                    ) || null
                                );
                            }
                        } else {
                            // XCHG_IJ (si,sj where 1 <= i < j <= 15)
                            if (i >= 1 && j > i && j <= 15) {
                                return (
                                    opcodes.find(
                                        (op) => op.name === 'XCHG_IJ'
                                    ) || null
                                );
                            }
                        }
                    }
                }
            }

            for (const op of opcodes) {
                if (op.doc_fift.includes('[') && op.doc_fift.includes(']')) {
                    const fiftParts = op.doc_fift.split(/\s+/);
                    const fiftCommand = fiftParts[0].toUpperCase();
                    if (fiftCommand === commandName) {
                        const paramPattern = fiftParts.slice(1).join(' ');
                        const userParams = parts.slice(1).join(' ');
                        if (
                            paramPattern.replace(/\[.*?\]/g, '*').includes('*')
                        ) {
                            return op;
                        }
                    }
                }
            }

            const matchingByDescription = opcodes.filter((op) =>
                op.doc_description.toUpperCase().includes(commandName)
            );

            if (matchingByDescription.length > 0) {
                return matchingByDescription[0];
            }

            const partialMatches = opcodes.filter(
                (op) =>
                    op.name.toUpperCase().includes(commandName) ||
                    (op.alias_of &&
                        op.alias_of.toUpperCase().includes(commandName))
            );

            return partialMatches.length > 0 ? partialMatches[0] : null;
        },
        [opcodes]
    );

    const handleOpcodeClick = useCallback(
        (hexCode: string) => {
            if (opcodes.length === 0) {
                loadOpcodesJson();
                return;
            }

            const opcodeInfo = findOpcodeInfo(hexCode);
            const allMatches = findRelatedOpcodes(hexCode, opcodes);
            setMatchingOpcodes(allMatches);
            setSelectedOpcode(opcodeInfo);
            setSelectedOpcodeStackDiff(
                parseOpcodeStackDiff(opcodeInfo?.doc_stack || '')
            );
        },
        [opcodes, loadOpcodesJson, findOpcodeInfo]
    );

    const findRelatedOpcodes = (
        opcodeStr: string,
        allOpcodes: Opcode[]
    ): Opcode[] => {
        const normalizedStr = opcodeStr.trim().toUpperCase();
        const parts = normalizedStr.split(/\s+|,/);
        const commandName = parts[0];

        return allOpcodes
            .filter(
                (op) =>
                    op.name.toUpperCase().includes(commandName) ||
                    (op.alias_of &&
                        op.alias_of.toUpperCase().includes(commandName)) ||
                    op.doc_fift.toUpperCase().includes(commandName)
            )
            .slice(0, 5);
    };

    // monitor and update maxDocWindowHeight when needed
    useEffect(() => {
        if (docBoxRef.current && selectedOpcode) {
            const currentHeight = docBoxRef.current.scrollHeight;
            if (currentHeight > maxDocWindowHeight) {
                setMaxDocWindowHeight(currentHeight);
            }
        }
    }, [selectedOpcode, maxDocWindowHeight]);

    const determineStackHighlightElements = useCallback(
        (stack: StackElement[], showBefore: boolean): number[] => {
            if (!selectedOpcodeStackDiff) return [];

            const elementsToHighlight: number[] = [];

            if (showBefore) {
                const consumed = selectedOpcodeStackDiff[0];
                for (let i = 0; i < consumed; i++) {
                    elementsToHighlight.push(i);
                }
            } else {
                const produced = selectedOpcodeStackDiff[1];
                for (let i = 0; i < produced; i++) {
                    elementsToHighlight.push(i);
                }
            }

            return elementsToHighlight;
        },
        [selectedOpcodeStackDiff]
    );

    return (
        <ChakraProvider theme={theme}>
            {testnet && (
                <Box bg={'red.500'} width="100%" mb="-13px">
                    <Center>
                        <Text color="white" mt="3px" mb="5px" fontSize="12">
                            Testnet version
                        </Text>
                    </Center>
                </Box>
            )}

            <Flex mt="2rem" mx="2rem">
                <Spacer />
                <Link
                    isExternal
                    aria-label="TVM Retracer GitHub page"
                    href="https://github.com/ton-blockchain/tvm-web-viewer/"
                >
                    <Icon
                        as={GithubIcon}
                        display="block"
                        transition="color 0.2s"
                        color="gray.500"
                        fontSize="1.5rem"
                        _hover={{ color: 'gray.800' }}
                    />
                </Link>
                <Link
                    ml="0.4rem"
                    isExternal
                    aria-label="TON Blockchain website"
                    href="https://ton.org"
                >
                    <Icon
                        as={TonIcon}
                        display="block"
                        transition="color 0.2s"
                        color="gray.500"
                        fontSize="1.5rem"
                        _hover={{ color: 'gray.800' }}
                    />
                </Link>
                <Link
                    ml="0.4rem"
                    isExternal
                    aria-label="TVM Docs"
                    href="https://docs.ton.org/learn/tvm-instructions/instructions"
                >
                    <Icon
                        as={DocsIcon}
                        display="block"
                        transition="color 0.2s"
                        color="gray.500"
                        fontSize="1.5rem"
                        _hover={{ color: 'gray.800' }}
                    />
                </Link>
            </Flex>
            <Center>
                <Box width="80%" alignContent="center" mt="4rem">
                    <Heading mb="0.5rem">TVM Retracer</Heading>
                    <InputGroup>
                        <Input
                            placeholder="Transaction link (any explorer)"
                            rounded="0"
                            size="md"
                            value={link}
                            onChange={(e) => setLink(e.target.value)}
                            type="url"
                            onKeyUp={(e) => {
                                if (e.key === 'Enter') {
                                    viewTransaction();
                                }
                            }}
                        ></Input>
                        <InputRightElement width="6rem">
                            <Button
                                fontSize="14.5px"
                                fontFamily="IntelOneMono Bold"
                                variant="solid"
                                h="95%"
                                rounded="0"
                                colorScheme="blue"
                                onClick={viewTransaction}
                            >
                                Emulate
                            </Button>
                        </InputRightElement>
                    </InputGroup>
                    {emulationResult ? (
                        <Box>
                            <Grid
                                mt="1rem"
                                fontSize="12"
                                templateColumns="repeat(3, 1fr)"
                                gap="1rem"
                            >
                                <Box>
                                    <Text>
                                        Sender: <br />
                                        {emulationResult.sender?.toString()}
                                    </Text>
                                    <Text>
                                        Contract: <br />
                                        {emulationResult.contract?.toString()}
                                    </Text>
                                    <Text>
                                        Amount:{' '}
                                        {emulationResult.amount
                                            ? fromNano(
                                                  emulationResult.amount || 0n
                                              ) + ' TON'
                                            : 'none'}
                                    </Text>
                                    <Text>
                                        Time:{' '}
                                        {new Date(
                                            emulationResult.utime * 1000 || 0
                                        ).toLocaleString()}
                                    </Text>
                                    <Text>
                                        Timestamp: {emulationResult.utime}
                                    </Text>
                                    <Text>
                                        Lt: {emulationResult.lt.toString()}
                                    </Text>
                                </Box>

                                {/* <Spacer /> */}
                                <Box ml="6rem">
                                    <Text>
                                        Balance before:{' '}
                                        {fromNano(
                                            emulationResult.money.balanceBefore
                                        )}{' '}
                                        TON
                                    </Text>

                                    <Text>
                                        Compute fees:{' '}
                                        {emulationResult.computeInfo !=
                                        'skipped'
                                            ? fromNano(
                                                  emulationResult.computeInfo
                                                      .gasFees
                                              ) + ' TON'
                                            : 'none'}
                                    </Text>
                                    <Text>
                                        Total fees:{' '}
                                        {fromNano(
                                            emulationResult.money.totalFees
                                        )}{' '}
                                        TON
                                    </Text>
                                    <Text>
                                        Total sent:{' '}
                                        {fromNano(
                                            emulationResult.money.sentTotal
                                        )}{' '}
                                        TON
                                    </Text>
                                    <Text>
                                        Balance after:{' '}
                                        {fromNano(
                                            emulationResult.money.balanceAfter
                                        )}{' '}
                                        TON
                                    </Text>
                                </Box>

                                <Box>
                                    <TxLink
                                        link={emulationResult.links.toncx}
                                        explorer="ton.cx"
                                    />

                                    <TxLink
                                        link={emulationResult.links.tonviewer}
                                        explorer="tonviewer.com"
                                    />
                                    <TxLink
                                        link={emulationResult.links.tonscan}
                                        explorer="tonscan.org"
                                    />
                                    <TxLink
                                        link={emulationResult.links.toncoin}
                                        explorer="explorer.toncoin.org"
                                    />
                                    <TxLink
                                        link={emulationResult.links.dton}
                                        explorer="dton.io"
                                    />
                                    <Flex mt="1.5rem">
                                        <Spacer />
                                        <Button
                                            px="2"
                                            mr="0.5rem"
                                            size="sm"
                                            rounded="0"
                                            fontSize="12"
                                            fontFamily="IntelOneMono"
                                            border="1px solid"
                                            borderColor="#979CCA"
                                            bg="#D5D9FF"
                                            leftIcon=<ExternalLinkIcon mr="-4px" />
                                            onClick={() => setIsC5Open(true)}
                                        >
                                            C5
                                        </Button>
                                        <Button
                                            size="sm"
                                            rounded="0"
                                            fontSize="12"
                                            fontFamily="IntelOneMono"
                                            border="1px solid"
                                            borderColor="#ACACAC"
                                            bg="#D9D9D9"
                                            leftIcon=<ExternalLinkIcon />
                                            onClick={() => setAreLogsOpen(true)}
                                        >
                                            Logs
                                        </Button>
                                    </Flex>
                                </Box>
                            </Grid>
                            {emulationResult.computeInfo !== 'skipped' ? (
                                <Box>
                                    <Box
                                        overflowY="scroll"
                                        height="34rem"
                                        border="solid"
                                        borderColor="#E2E8F0"
                                        bgColor="#F4F4F4"
                                        w="100%"
                                        mt="1rem"
                                        py="1.2rem"
                                        px="2rem"
                                    >
                                        <Flex fontSize="12">
                                            <Spacer />
                                            <Text>
                                                Success:{' '}
                                                {emulationResult.computeInfo.success.toString()}
                                            </Text>
                                            <Spacer />
                                            <Text>
                                                Exit code:{' '}
                                                {
                                                    emulationResult.computeInfo
                                                        .exitCode
                                                }
                                            </Text>
                                            <Spacer />
                                            <Text>
                                                Vm steps:{' '}
                                                {
                                                    emulationResult.computeInfo
                                                        .vmSteps
                                                }
                                            </Text>

                                            <Spacer />
                                            <Text>
                                                Gas used:{' '}
                                                {emulationResult.computeInfo.gasUsed.toString()}
                                            </Text>
                                            <Spacer />
                                        </Flex>
                                        <Flex mt="1rem">
                                            <Box>
                                                {emulationResult.computeLogs.map(
                                                    (log, i) => (
                                                        <Box key={i}>
                                                            <Button
                                                                variant="link"
                                                                fontFamily="IntelOneMono"
                                                                textColor="#5B5B5B"
                                                                fontSize="14"
                                                                onClick={() => {
                                                                    setSelectedStep(
                                                                        i
                                                                    );
                                                                    handleOpcodeClick(
                                                                        log.instruction
                                                                    );
                                                                }}
                                                            >
                                                                <Tooltip
                                                                    label={
                                                                        !log.error
                                                                            ? `${log.price ? `Step cost: ${log.price}  ` : ''}Gas remaining: ${log.gasRemaining}`
                                                                            : `Exit code ${log.error.code}: ${log.error.text}`
                                                                    }
                                                                    placement="right"
                                                                    hasArrow
                                                                    openDelay={
                                                                        100
                                                                    }
                                                                    fontSize="12"
                                                                >
                                                                    <Text
                                                                        bgColor={
                                                                            log.error
                                                                                ? 'red.200'
                                                                                : selectedStep ==
                                                                                    i
                                                                                  ? 'white'
                                                                                  : undefined
                                                                        }
                                                                    >
                                                                        {i + 1}.{' '}
                                                                        {shortStep(
                                                                            log.instruction
                                                                        )}
                                                                    </Text>
                                                                </Tooltip>
                                                            </Button>
                                                        </Box>
                                                    )
                                                )}
                                            </Box>
                                            <Spacer />

                                            {emulationResult.computeLogs && (
                                                <Box position="relative">
                                                    <Box
                                                        position="sticky"
                                                        zIndex="1"
                                                        w="25rem"
                                                        bg="#D9D9D9"
                                                        top="1rem"
                                                        py="1rem"
                                                        border="1px dashed"
                                                        borderColor="#A2A2A2"
                                                    >
                                                        <Flex px="1rem">
                                                            <Tooltip
                                                                label="Use Left key"
                                                                openDelay={500}
                                                                fontSize="12"
                                                            >
                                                                <Button
                                                                    mt="0.5rem"
                                                                    mr="1rem"
                                                                    variant="link"
                                                                    p="0"
                                                                    fontSize="14"
                                                                    color="#000"
                                                                    onClick={
                                                                        prevStep
                                                                    }
                                                                >
                                                                    {'<'}
                                                                </Button>
                                                            </Tooltip>
                                                            <Spacer />
                                                            <Center>
                                                                <Text
                                                                    fontFamily="IntelOneMono Bold"
                                                                    fontSize="14"
                                                                    textAlign="center"
                                                                >
                                                                    {selectedStep +
                                                                        1}
                                                                    .{' '}
                                                                    {shortStep(
                                                                        emulationResult
                                                                            .computeLogs[
                                                                            selectedStep
                                                                        ]
                                                                            .instruction
                                                                    )}
                                                                </Text>
                                                            </Center>
                                                            <Spacer />
                                                            <Tooltip
                                                                label="Use Right key"
                                                                openDelay={500}
                                                                fontSize="12"
                                                            >
                                                                <Button
                                                                    mt="0.5rem"
                                                                    ml="1rem"
                                                                    variant="link"
                                                                    p="0"
                                                                    fontSize="14"
                                                                    color="#000"
                                                                    onClick={
                                                                        nextStep
                                                                    }
                                                                >
                                                                    {'>'}
                                                                </Button>
                                                            </Tooltip>
                                                        </Flex>
                                                        <Flex
                                                            justifyContent="center"
                                                            alignItems="center"
                                                            mb={2}
                                                        >
                                                            <Text
                                                                fontSize="12"
                                                                cursor={
                                                                    selectedStep >
                                                                    0
                                                                        ? 'help'
                                                                        : 'default'
                                                                }
                                                                textDecoration={
                                                                    isHoveringStack &&
                                                                    selectedStep >
                                                                        0
                                                                        ? 'underline'
                                                                        : 'none'
                                                                }
                                                                color={
                                                                    isHoveringStack &&
                                                                    selectedStep >
                                                                        0
                                                                        ? 'blue.500'
                                                                        : undefined
                                                                }
                                                                onMouseEnter={() =>
                                                                    selectedStep >
                                                                        0 &&
                                                                    setIsHoveringStack(
                                                                        true
                                                                    )
                                                                }
                                                                onMouseLeave={() =>
                                                                    selectedStep >
                                                                        0 &&
                                                                    setIsHoveringStack(
                                                                        false
                                                                    )
                                                                }
                                                            >
                                                                {isHoveringStack &&
                                                                selectedStep > 0
                                                                    ? 'Stack before:'
                                                                    : 'Stack after:'}
                                                            </Text>
                                                        </Flex>
                                                        <TableContainer
                                                            mt="0.5rem"
                                                            overflowY="scroll"
                                                            height="25rem"
                                                        >
                                                            {emulationResult
                                                                .computeLogs[
                                                                selectedStep
                                                            ].error && (
                                                                <Box
                                                                    bgColor="red.200"
                                                                    fontFamily="IntelOneMono Bold"
                                                                    fontSize="12"
                                                                >
                                                                    <Center pt="2">
                                                                        <Text>
                                                                            Failed
                                                                            with
                                                                            exit
                                                                            code{' '}
                                                                            {
                                                                                emulationResult
                                                                                    .computeLogs[
                                                                                    selectedStep
                                                                                ]
                                                                                    .error!
                                                                                    .code
                                                                            }
                                                                        </Text>
                                                                    </Center>
                                                                    <Center
                                                                        whiteSpace="pre-wrap"
                                                                        p="2"
                                                                        textAlign="center"
                                                                    >
                                                                        {
                                                                            emulationResult
                                                                                .computeLogs[
                                                                                selectedStep
                                                                            ]
                                                                                .error!
                                                                                .text
                                                                        }
                                                                    </Center>
                                                                </Box>
                                                            )}
                                                            <Table
                                                                size="sm"
                                                                variant="unstyled"
                                                            >
                                                                <Tbody>
                                                                    {(() => {
                                                                        const showBefore =
                                                                            isHoveringStack &&
                                                                            selectedStep >
                                                                                0;
                                                                        const stack =
                                                                            showBefore
                                                                                ? emulationResult
                                                                                      .computeLogs[
                                                                                      selectedStep -
                                                                                          1
                                                                                  ]
                                                                                      .stackAfter
                                                                                : emulationResult
                                                                                      .computeLogs[
                                                                                      selectedStep
                                                                                  ]
                                                                                      .stackAfter;

                                                                        const elementsToHighlight =
                                                                            determineStackHighlightElements(
                                                                                stack,
                                                                                showBefore
                                                                            );

                                                                        return stack
                                                                            .toReversed()
                                                                            .map(
                                                                                (
                                                                                    item,
                                                                                    i
                                                                                ) =>
                                                                                    stackItemElement(
                                                                                        item,
                                                                                        i,
                                                                                        handleCopy,
                                                                                        elementsToHighlight.includes(
                                                                                            i
                                                                                        ),
                                                                                        showBefore
                                                                                    )
                                                                            );
                                                                    })()}
                                                                </Tbody>
                                                            </Table>
                                                        </TableContainer>
                                                    </Box>
                                                </Box>
                                            )}
                                        </Flex>
                                    </Box>

                                    <Center>
                                        <Box
                                            mt="2rem"
                                            w="100%"
                                            position="relative"
                                            bg="white"
                                            overflow="hidden"
                                            px="2rem"
                                            height={
                                                maxDocWindowHeight > 0
                                                    ? `${maxDocWindowHeight}px`
                                                    : 'auto'
                                            }
                                            minHeight="400px"
                                            overflowY="auto"
                                            ref={docBoxRef}
                                        >
                                            {selectedOpcode ? (
                                                <Box>
                                                    <Flex alignItems="center">
                                                        <Text
                                                            fontSize="20"
                                                            fontFamily="IntelOneMono Bold"
                                                        >
                                                            {
                                                                selectedOpcode.name
                                                            }
                                                        </Text>
                                                        {selectedOpcode.alias_of && (
                                                            <Text
                                                                fontSize="16"
                                                                color="gray.500"
                                                                ml="2"
                                                            >
                                                                (alias of{' '}
                                                                {
                                                                    selectedOpcode.alias_of
                                                                }
                                                                )
                                                            </Text>
                                                        )}
                                                    </Flex>
                                                    <Text
                                                        fontSize="14"
                                                        lineHeight="1.5"
                                                        whiteSpace="pre-wrap"
                                                        sx={{
                                                            '& code': {
                                                                bg: 'gray.100',
                                                                p: '1px 4px',
                                                                borderRadius:
                                                                    '3px',
                                                                fontFamily:
                                                                    'IntelOneMono',
                                                                fontSize: '90%',
                                                            },
                                                            '& em': {
                                                                fontStyle:
                                                                    'italic',
                                                                color: 'gray.700',
                                                            },
                                                        }}
                                                    >
                                                        <br />
                                                        <em>Fift:</em>{' '}
                                                        {selectedOpcode.doc_fift
                                                            .split('\n')
                                                            .map(
                                                                (
                                                                    asm,
                                                                    index
                                                                ) => (
                                                                    <code
                                                                        key={
                                                                            index
                                                                        }
                                                                    >
                                                                        {asm}
                                                                    </code>
                                                                )
                                                            )
                                                            .reduce(
                                                                (
                                                                    prev,
                                                                    curr,
                                                                    i
                                                                ) => [
                                                                    ...prev,
                                                                    i > 0
                                                                        ? ','
                                                                        : null,
                                                                    curr,
                                                                ],
                                                                [] as React.ReactNode[]
                                                            )}
                                                        <br />
                                                        <em>TLB:</em>{' '}
                                                        <code>
                                                            {selectedOpcode.tlb}
                                                        </code>
                                                        <br />
                                                        <em>Stack:</em>{' '}
                                                        <code>
                                                            {
                                                                selectedOpcode.doc_stack
                                                            }
                                                        </code>
                                                        <br />
                                                        <em>Gas:</em>{' '}
                                                        <code>
                                                            {
                                                                selectedOpcode.doc_gas
                                                            }
                                                        </code>
                                                        <br />
                                                        <br />
                                                        <div
                                                            dangerouslySetInnerHTML={{
                                                                __html: parseMarkdown(
                                                                    selectedOpcode.doc_description
                                                                ),
                                                            }}
                                                        />
                                                    </Text>
                                                    {matchingOpcodes.length >
                                                        1 && (
                                                        <Box mt={4}>
                                                            <Text
                                                                fontSize="12"
                                                                fontWeight="bold"
                                                            >
                                                                Similar opcodes:
                                                            </Text>
                                                            <Flex
                                                                flexWrap="wrap"
                                                                gap={2}
                                                                mt={1}
                                                            >
                                                                {matchingOpcodes.map(
                                                                    (
                                                                        op,
                                                                        idx
                                                                    ) => (
                                                                        <Button
                                                                            key={
                                                                                idx
                                                                            }
                                                                            size="xs"
                                                                            variant={
                                                                                op.name ===
                                                                                selectedOpcode.name
                                                                                    ? 'solid'
                                                                                    : 'outline'
                                                                            }
                                                                            rounded="0"
                                                                            borderColor="#ACACAC"
                                                                            bg={
                                                                                op.name ===
                                                                                selectedOpcode.name
                                                                                    ? '#D9D9D9'
                                                                                    : '#ffffff'
                                                                            }
                                                                            onClick={() =>
                                                                                setSelectedOpcode(
                                                                                    op
                                                                                )
                                                                            }
                                                                        >
                                                                            {
                                                                                op.name
                                                                            }
                                                                        </Button>
                                                                    )
                                                                )}
                                                            </Flex>
                                                        </Box>
                                                    )}
                                                </Box>
                                            ) : null}
                                        </Box>
                                    </Center>
                                    <Box
                                        m="1rem"
                                        fontSize="10"
                                        opacity="50%"
                                        fontFamily="IntelOneMono"
                                    >
                                        <Center>
                                            Used Emulator from commit{' '}
                                            <Link
                                                mx="1"
                                                href={`https://github.com/ton-blockchain/ton/tree/${emulationResult.emulatorVersion.commitHash}`}
                                            >
                                                {emulationResult.emulatorVersion.commitHash.slice(
                                                    0,
                                                    7
                                                )}
                                            </Link>
                                            at{' '}
                                            {
                                                emulationResult.emulatorVersion
                                                    .commitDate
                                            }
                                        </Center>
                                    </Box>
                                </Box>
                            ) : (
                                <Center>
                                    <Text>Compute phase was skipped</Text>
                                </Center>
                            )}
                        </Box>
                    ) : (
                        <></>
                    )}
                    {processing ? (
                        <Box>
                            <Center>
                                <Spinner
                                    mt="2rem"
                                    thickness="4px"
                                    speed="0.65s"
                                    emptyColor="gray.200"
                                    color="blue.500"
                                    size="xl"
                                />
                            </Center>
                            <Center>
                                <Text mt="0.5rem" fontSize="14">
                                    {emulationStatus}
                                </Text>
                            </Center>
                        </Box>
                    ) : (
                        <></>
                    )}
                </Box>
            </Center>

            <Modal
                isOpen={isC5Open}
                isCentered
                scrollBehavior="inside"
                size="full"
                onClose={() => setIsC5Open(false)}
            >
                <ModalOverlay />
                <ModalContent rounded="0">
                    <ModalHeader fontFamily="IntelOneMono Bold">
                        Actions cell (C5)
                    </ModalHeader>
                    <ModalCloseButton />
                    {emulationResult ? (
                        <ModalBody
                            fontSize="12"
                            fontFamily="IntelOneMono"
                            whiteSpace="pre-wrap"
                        >
                            <SimpleGrid minChildWidth="27rem" spacing="2rem">
                                {emulationResult.actions.length > 0 ? (
                                    emulationResult.actions.map(
                                        outActionElement
                                    )
                                ) : (
                                    <Text>No actions</Text>
                                )}
                            </SimpleGrid>
                        </ModalBody>
                    ) : (
                        <></>
                    )}
                    <ModalFooter>
                        <Button
                            rounded="0"
                            size="sm"
                            fontFamily="IntelOneMono"
                            colorScheme="gray"
                            border="1px solid"
                            borderColor="#ACACAC"
                            bg="#D9D9D9"
                            mr={3}
                            onClick={() => setIsC5Open(false)}
                        >
                            Close
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal
                isOpen={areLogsOpen}
                isCentered
                scrollBehavior="inside"
                size="full"
                onClose={() => setAreLogsOpen(false)}
            >
                <ModalOverlay />
                <ModalContent rounded="0">
                    <ModalHeader fontFamily="IntelOneMono Bold">
                        Executor logs
                    </ModalHeader>
                    <ModalCloseButton />
                    {emulationResult ? (
                        <ModalBody
                            fontSize="12"
                            fontFamily="IntelOneMono"
                            whiteSpace="pre-wrap"
                        >
                            {emulationResult.executorLogs}
                        </ModalBody>
                    ) : (
                        <></>
                    )}
                    <ModalFooter>
                        <Button
                            rounded="0"
                            size="sm"
                            fontFamily="IntelOneMono"
                            colorScheme="gray"
                            border="1px solid"
                            borderColor="#ACACAC"
                            bg="#D9D9D9"
                            mr={3}
                            onClick={() => setAreLogsOpen(false)}
                        >
                            Close
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            <Modal isOpen={isErrorOpen} isCentered onClose={onCloseErrorModal}>
                <ModalOverlay />
                <ModalContent rounded="0">
                    <ModalHeader fontFamily="IntelOneMono Bold">
                        Error occured
                    </ModalHeader>
                    <ModalCloseButton />
                    <ModalBody>{errorText}</ModalBody>
                    <ModalFooter>
                        <Button
                            rounded="0"
                            fontFamily="IntelOneMono Bold"
                            colorScheme="red"
                            mr={3}
                            onClick={onCloseErrorModal}
                        >
                            Close
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
        </ChakraProvider>
    );
}
const parseMarkdown = (text: string): string => {
    if (!text) return '';
    let parsed = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/\_([^_]+)\_/g, '<em>$1</em>');
    parsed = parsed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    return parsed;
};

const parseOpcodeStackDiff = (text: string): [number, number] | null => {
    try {
        // parse stack description items count before and after
        // "x - x x" -> [1, 2]
        // "x -" -> [1, 0]
        // "c c' - c''" -> [2, 1]
        // and so on

        if (text.length === 0) return null;
        if (text === '-') return null;
        if (text.includes('or') && !text.includes('xor')) return null;
        if (text.includes('...')) return null;

        if (text.startsWith('- ')) {
            const afterPart = text.substring(2);
            return [0, countStackItems(afterPart)];
        }

        if (text.endsWith(' -')) {
            const beforePart = text.substring(0, text.length - 2);
            return [countStackItems(beforePart), 0];
        }

        const parts = text.split(' - ');
        if (parts.length !== 2) return null;

        return [countStackItems(parts[0]), countStackItems(parts[1])];
    } catch {
        return null;
    }
};

const countStackItems = (stackPart: string): number => {
    if (!stackPart.trim()) return 0;

    // replace "a mod b" or "a xor b" with one token, to count them as one element
    const normalized = stackPart
        .replace(/\w+\s+mod\s+\w+/g, 'X')
        .replace(/\w+\s+xor\s+\w+/g, 'X');

    // split string by spaces and count tokens
    const tokens = normalized.trim().split(' ');
    return tokens.length;
};

function outActionElement(action: OutAction, i: number) {
    const json = JSON.stringify(
        action,
        (_, v) => {
            if (typeof v === 'bigint') return v.toString();
            if (v instanceof Address) return v.toString();
            if (v instanceof Cell) return v.toBoc().toString('base64');
            return v;
        },
        2
    );
    const unquotedJson = json
        .replace(/"([a-zA-Z0-9_]+)":/g, '$1:') // Remove quotes from keys
        .replace(/"(\d+)"/g, '$1') // Remove quotes from numbers
        .replace(/"\[(.*?)\]"/g, '[$1]') // Remove quotes from arrays
        .replace(/"([^"]+?)":/g, '$1:') // Remove quotes from string values
        .replace(/: "([^"]+)"/g, ': $1'); // Remove quotes from values

    // const text = customStringify(json);
    if (action.type === 'sendMsg') {
        const msgCell = beginCell()
            .store(storeMessageRelaxed(action.outMsg))
            .asCell();
        return (
            <Card
                width="100%"
                m="1rem"
                rounded="0"
                border="1px solid"
                borderColor="#788892"
                bg="#D8F1FF"
                shadow="none"
            >
                <CardHeader
                    fontFamily="IntelOneMono Bold"
                    alignSelf="center"
                    fontSize="20"
                    mb="-1rem"
                >
                    {i + 1}. Send Message
                </CardHeader>
                <CardBody fontSize="10" whiteSpace="pre-wrap">
                    {unquotedJson}
                </CardBody>
                <CardFooter>
                    <Flex direction="column" width="100%" gap="0.5rem">
                        <CopyButton
                            text={'Copy message cell'}
                            copyContent={msgCell.toBoc().toString('base64')}
                            bg="#B5E4FF"
                        />
                        <CopyButton
                            text={'Copy message body'}
                            copyContent={
                                action.outMsg.body?.toString('base64') || ''
                            }
                            bg="#B5E4FF"
                        />
                        <CopyButton
                            text={'Copy action as json'}
                            copyContent={json}
                            bg="#B5E4FF"
                        />
                    </Flex>
                </CardFooter>
            </Card>
        );
    } else if (action.type === 'setCode') {
        return (
            <Card
                width="27rem"
                m="1rem"
                rounded="0"
                border="1px solid"
                borderColor="#A89871"
                bg="#FFEAB6"
                shadow="none"
            >
                <CardHeader
                    fontFamily="IntelOneMono Bold"
                    alignSelf="center"
                    fontSize="20"
                    mb="-1rem"
                >
                    {i + 1}. Set Code
                </CardHeader>
                <CardBody fontSize="10" whiteSpace="pre-wrap">
                    {unquotedJson}
                </CardBody>
                <CardFooter>
                    <Flex direction="column" width="100%" gap="0.5rem">
                        <CopyButton
                            text={'Copy new code cell'}
                            copyContent={action.newCode
                                .toBoc()
                                .toString('base64')}
                            bg="#FFD392"
                        />
                        <CopyButton
                            text={'Copy action as json'}
                            copyContent={json}
                            bg="#FFD392"
                        />
                    </Flex>
                </CardFooter>
            </Card>
        );
    } else if (action.type === 'reserve') {
        return (
            <Card
                width="27rem"
                m="1rem"
                rounded="0"
                border="1px solid"
                borderColor="#8100AE"
                bg="#F6DBFF"
                shadow="none"
            >
                <CardHeader
                    fontFamily="IntelOneMono Bold"
                    alignSelf="center"
                    fontSize="20"
                    mb="-1rem"
                >
                    {i + 1}. Raw Reserve
                </CardHeader>
                <CardBody fontSize="10" whiteSpace="pre-wrap">
                    {unquotedJson}
                </CardBody>
                <CardFooter>
                    <Flex direction="column" width="100%" gap="0.5rem">
                        <CopyButton
                            text={'Copy coins'}
                            copyContent={action.currency.coins.toString()}
                            bg="#EBB6FE"
                        />
                        <CopyButton
                            text={'Copy action as json'}
                            copyContent={json}
                            bg="#EBB6FE"
                        />
                    </Flex>
                </CardFooter>
            </Card>
        );
    } else if (action.type == 'changeLibrary') {
        return (
            <Card
                width="27rem"
                m="1rem"
                rounded="0"
                border="1px solid"
                borderColor="#039F01"
                bg="#DCFFDB"
                shadow="none"
            >
                <CardHeader
                    fontFamily="IntelOneMono Bold"
                    alignSelf="center"
                    fontSize="20"
                    mb="-1rem"
                >
                    {i + 1}. Change Library
                </CardHeader>
                <CardBody fontSize="10" whiteSpace="pre-wrap">
                    {unquotedJson}
                </CardBody>
                <CardFooter>
                    <Flex direction="column" width="100%" gap="0.5rem">
                        {action.libRef.type == 'hash' ? (
                            <CopyButton
                                text={'Copy lib hash'}
                                copyContent={action.libRef.libHash.toString(
                                    'base64'
                                )}
                                bg="#A4F7A3"
                            />
                        ) : (
                            <CopyButton
                                text={'Copy lib cell'}
                                copyContent={action.libRef.library
                                    .toBoc()
                                    .toString('base64')}
                                bg="#A4F7A3"
                            />
                        )}
                        <CopyButton
                            text={'Copy action as json'}
                            copyContent={json}
                            bg="#A4F7A3"
                        />
                    </Flex>
                </CardFooter>
            </Card>
        );
    }
    return <> </>;
}

function CopyButton({
    text,
    copyContent,
    bg,
}: {
    text: string;
    copyContent: string;
    bg: string;
}) {
    return (
        <Button
            width="100%"
            rounded="0"
            colorScheme="gray"
            border="1px solid"
            borderColor="#A3A3A3"
            bg={bg}
            fontSize="12"
            onClick={() => navigator.clipboard.writeText(copyContent)}
        >
            {text}
        </Button>
    );
}

function stackItemElement(
    item: StackElement,
    i: number,
    handleCopy: (text: string) => void,
    isHighlighted: boolean = false,
    isStackBefore: boolean = false
) {
    if (Array.isArray(item)) {
        return (
            <>
                <Tr p="0">
                    <Td p="0">
                        <Box
                            key={i}
                            p="0.5rem"
                            backgroundColor={
                                i % 2 === 0 ? 'gray.100' : '#D9D9D9'
                            }
                        >
                            <Text>{i}. Tuple</Text>
                            <Flex mt="0.5rem">
                                <Divider orientation="vertical" />
                                <TableContainer>
                                    <Table size="sm" variant="unstyled">
                                        <Tbody>
                                            {item.map((subItem, j) =>
                                                stackItemElement(
                                                    subItem,
                                                    j,
                                                    handleCopy,
                                                    isHighlighted,
                                                    isStackBefore
                                                )
                                            )}
                                        </Tbody>
                                    </Table>
                                </TableContainer>
                            </Flex>
                        </Box>
                    </Td>
                </Tr>
            </>
        );
    }
    let strRes: string;
    let copyContent = '';
    if (item instanceof Cell) {
        strRes = item.bits.toString();
        if (strRes.length > 14)
            strRes = strRes.slice(0, 7) + '...' + strRes.slice(-7);
        strRes =
            `Cell {${strRes}}` +
            (item.refs.length > 0 ? ` + ${item.refs.length} refs` : '');
        copyContent = item.toBoc().toString('hex');
    }
    //
    else if (item instanceof Slice) {
        item = item.asCell().asSlice();
        strRes = item.loadBits(item.remainingBits).toString();
        if (strRes.length > 14)
            strRes = strRes.slice(0, 7) + '...' + strRes.slice(-7);
        strRes =
            `Slice {${strRes}}` +
            (item.remainingRefs > 0 ? ` + ${item.remainingRefs} refs` : '');
        copyContent = item.asCell().toBoc().toString('hex');
    }
    //
    else if (item instanceof Builder) {
        strRes = item.asCell().bits.toString();
        if (strRes.length > 14)
            strRes = strRes.slice(0, 7) + '...' + strRes.slice(-7);
        strRes =
            `Builder {${strRes}}` +
            (item.refs > 0 ? ` + ${item.refs} refs` : '');
        copyContent = item.asCell().toBoc().toString('hex');
    }
    //
    else if (item == null) {
        strRes = 'null';
        copyContent = 'null';
    }
    //
    else if (typeof item === 'string') {
        strRes = item;
        if (strRes.length > 30)
            strRes = strRes.slice(0, 26) + '...' + strRes.slice(-4);
        copyContent = item;
    }
    //
    else {
        strRes = item.toString();
        if (strRes.length > 30)
            strRes = strRes.slice(0, 15) + '...' + strRes.slice(-15);
        copyContent = item.toString();
    }

    const highlightColor = isHighlighted
        ? isStackBefore
            ? '#ECBC92'
            : '#68C8FF'
        : undefined;

    return (
        <Tr key={i} p="0">
            <Td p="0">
                <Flex backgroundColor={i % 2 === 0 ? 'gray.100' : '#D9D9D9'}>
                    <Box backgroundColor={highlightColor} w="5px" />
                    <Link p="0.5rem" onClick={() => handleCopy(copyContent)}>
                        {i}. {strRes}
                    </Link>
                </Flex>
            </Td>
        </Tr>
    );
}

function shortStep(step: string) {
    if (step.length > 24) return step.slice(0, 19) + '...' + step.slice(-5);
    return step;
}

function TxLink({ explorer, link }: { explorer: string; link: string }) {
    return (
        <Flex>
            <Spacer />
            <Link
                href={link}
                fontSize="12"
                color="blue.400"
                textAlign="right"
                isExternal
                _hover={{ textDecoration: 'none' }}
                textDecoration="underline"
            >
                {explorer}
            </Link>
        </Flex>
    );
}

export default App;
