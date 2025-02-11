/**
 * Copyright (c) 2025 Bytedance, Inc. and its affiliates.
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  Box,
  Button,
  Center,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Select,
  Spinner,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  VStack,
  useToast,
  Textarea,
  Text,
  Divider,
} from '@chakra-ui/react';
import { Field, Form, Formik } from 'formik';
import { useLayoutEffect } from 'react';
import { useDispatch } from 'zutron';

import { VlmProvider } from '@main/store/types';

import { useStore } from '@renderer/hooks/useStore';
import { isWindows } from '@renderer/utils/os';

interface ErrorWithMessage {
  message: string;
}

function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

function toErrorWithMessage(maybeError: unknown): ErrorWithMessage {
  if (isErrorWithMessage(maybeError)) return maybeError;

  try {
    return new Error(JSON.stringify(maybeError));
  } catch {
    return new Error(String(maybeError));
  }
}

interface PineconeRecord {
  id: string;
  vector?: number[];
  metadata: {
    name: string;
    description: string;
    instructions: string[];
    tags: string[];
  };
}

const Settings = () => {
  const { settings, thinking } = useStore();
  const toast = useToast();
  const dispatch = useDispatch(window.zutron);

  useLayoutEffect(() => {
    console.log('get_settings');
    dispatch({
      type: 'GET_SETTINGS',
      payload: null,
    });
  }, []);

  console.log('settings', settings, 'thinking', thinking);

  const handleSubmit = async (values) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: values,
    });

    toast({
      title: 'Settings saved successfully',
      position: 'top',
      status: 'success',
      duration: 1500,
      isClosable: true,
      variant: 'ui-tars-success',
      onCloseComplete: () => {
        dispatch({
          type: 'CLOSE_SETTINGS_WINDOW',
          payload: null,
        });
      },
    });
  };

  const handleCancel = () => {
    dispatch({
      type: 'CLOSE_SETTINGS_WINDOW',
      payload: null,
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string);
          const pineconeRecord: PineconeRecord = {
            id: json.id,
            metadata: {
              name: json.name,
              description: json.description,
              instructions: json.instructions,
              tags: json.tags,
            }
          };

          dispatch({
            type: 'ADD_PINECONE_RECORD',
            payload: pineconeRecord,
          });
          toast({
            title: 'Record added successfully',
            status: 'success',
            duration: 2000,
          });
        } catch (error) {
          const errorMessage = toErrorWithMessage(error).message;
          toast({
            title: 'Invalid JSON file',
            description: errorMessage,
            status: 'error',
            duration: 3000,
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleManualSubmit = (values: any) => {
    try {
      const record: PineconeRecord = {
        id: values.recordId,
        metadata: {
          name: values.recordName,
          description: values.recordDescription,
          instructions: values.recordInstructions.split('\n').filter((line: string) => line.trim()),
          tags: values.recordTags.split(',').map((tag: string) => tag.trim()),
        }
      };

      dispatch({
        type: 'ADD_PINECONE_RECORD',
        payload: record,
      });

      toast({
        title: 'Record added successfully',
        status: 'success',
        duration: 2000,
      });
    } catch (error) {
      const errorMessage = toErrorWithMessage(error).message;
      toast({
        title: 'Error adding record',
        description: errorMessage,
        status: 'error',
        duration: 3000,
      });
    }
  };

  console.log('initialValues', settings);

  return (
    <Box
      px={4}
      py={!isWindows ? 8 : 0}
      position="relative"
      height="100vh"
      overflow="hidden"
    >
      {!isWindows && (
        <Box
          className="draggable-area"
          w="100%"
          h={34}
          position="absolute"
          top={0}
        />
      )}
      <Tabs
        variant="line"
        display="flex"
        flexDirection="column"
        height="100%"
      >
        <TabList>
          <Tab>General</Tab>
          <Tab>Pinecone Config</Tab>
          <Tab>Add Record</Tab>
        </TabList>

        <TabPanels
          flex="1"
          overflow="auto"
        >
          <TabPanel>
            <VStack spacing={8} align="stretch">
              {settings ? (
                <Formik initialValues={settings} onSubmit={handleSubmit}>
                  {({ values = {}, setFieldValue }) => (
                    <Form>
                      <VStack spacing={4} align="stretch">
                        <FormControl>
                          <FormLabel color="gray.700">Language</FormLabel>
                          <Field
                            as={Select}
                            name="language"
                            value={values.language}
                            bg="white"
                            borderColor="gray.200"
                            _hover={{ borderColor: 'gray.300' }}
                            _focus={{
                              borderColor: 'gray.400',
                              boxShadow: 'none',
                            }}
                          >
                            <option key="en" value="en">
                              English
                            </option>
                            <option key="zh" value="zh">
                              中文
                            </option>
                          </Field>
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM Provider</FormLabel>
                          <Field
                            as={Select}
                            name="vlmProvider"
                            value={values.vlmProvider}
                            bg="white"
                            borderColor="gray.200"
                            _hover={{ borderColor: 'gray.300' }}
                            _focus={{
                              borderColor: 'gray.400',
                              boxShadow: 'none',
                            }}
                            onChange={(e) => {
                              const newValue = e.target.value;
                              setFieldValue('vlmProvider', newValue);

                              if (!settings.vlmBaseUrl) {
                                setFieldValue('vlmProvider', newValue);
                                if (newValue === VlmProvider.vLLM) {
                                  setFieldValue(
                                    'vlmBaseUrl',
                                    'http://localhost:8000/v1',
                                  );
                                  setFieldValue('vlmModelName', 'ui-tars');
                                } else if (
                                  newValue === VlmProvider.Huggingface
                                ) {
                                  setFieldValue(
                                    'vlmBaseUrl',
                                    'https://<your_service>.us-east-1.aws.endpoints.huggingface.cloud/v1',
                                  );
                                  setFieldValue('vlmApiKey', 'your_api_key');
                                  setFieldValue(
                                    'vlmModelName',
                                    'your_model_name',
                                  );
                                }
                              }
                            }}
                          >
                            {Object.values(VlmProvider).map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </Field>
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM Base URL</FormLabel>
                          <Field
                            as={Input}
                            name="vlmBaseUrl"
                            value={values.vlmBaseUrl}
                            placeholder="please input VLM Base URL"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM API Key</FormLabel>
                          <Field
                            as={Input}
                            name="vlmApiKey"
                            value={values.vlmApiKey}
                            placeholder="please input VLM API_Key"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel color="gray.700">VLM Model Name</FormLabel>
                          <Field
                            as={Input}
                            name="vlmModelName"
                            value={values.vlmModelName}
                            placeholder="please input VLM Model Name"
                          />
                        </FormControl>

                        <HStack spacing={4}>
                          <Button
                            type="submit"
                            rounded="base"
                            variant="tars-ghost"
                          >
                            Save
                          </Button>
                          <Button
                            onClick={handleCancel}
                            rounded="base"
                            variant="ghost"
                            fontWeight="normal"
                          >
                            Cancel
                          </Button>
                        </HStack>
                      </VStack>
                    </Form>
                  )}
                </Formik>
              ) : (
                <Center>
                  <Spinner color="color.primary" />
                </Center>
              )}
            </VStack>
          </TabPanel>

          <TabPanel>
            <VStack spacing={8} align="stretch">
              {settings ? (
                <>
                  <Formik initialValues={settings} onSubmit={handleSubmit}>
                    {({ values = {}, setFieldValue }) => (
                      <Form>
                        <VStack spacing={4} align="stretch">
                          <FormControl>
                            <FormLabel color="gray.700">Pinecone API Key</FormLabel>
                            <Field
                              as={Input}
                              name="pineconeApiKey"
                              value={values.pineconeApiKey}
                              placeholder="Enter your Pinecone API key"
                              type="password"
                            />
                          </FormControl>

                          <FormControl>
                            <FormLabel color="gray.700">Pinecone Environment</FormLabel>
                            <Field
                              as={Input}
                              name="pineconeEnvironment"
                              value={values.pineconeEnvironment}
                              placeholder="e.g., us-east-1"
                            />
                          </FormControl>

                          <FormControl>
                            <FormLabel color="gray.700">Pinecone Index</FormLabel>
                            <Field
                              as={Input}
                              name="pineconeIndex"
                              value={values.pineconeIndex}
                              placeholder="e.g., usecase-automation"
                            />
                          </FormControl>

                          <HStack spacing={4}>
                            <Button
                              type="submit"
                              rounded="base"
                              variant="tars-ghost"
                            >
                              Save
                            </Button>
                            <Button
                              onClick={handleCancel}
                              rounded="base"
                              variant="ghost"
                              fontWeight="normal"
                            >
                              Cancel
                            </Button>
                          </HStack>
                        </VStack>
                      </Form>
                    )}
                  </Formik>

                  <Box mt={4} p={4} bg="gray.50" borderRadius="md">
                    <Text fontSize="sm" fontWeight="medium" mb={2}>
                      Current Configuration:
                    </Text>
                    <pre style={{ fontSize: '12px' }}>
                      {JSON.stringify(
                        {
                          pineconeApiKey: settings.pineconeApiKey ? '***' : 'not set',
                          pineconeEnvironment: settings.pineconeEnvironment || 'not set',
                          pineconeIndex: settings.pineconeIndex || 'not set',
                        },
                        null,
                        2
                      )}
                    </pre>
                  </Box>
                </>
              ) : (
                <Center>
                  <Spinner color="color.primary" />
                </Center>
              )}
            </VStack>
          </TabPanel>

          <TabPanel>
            <VStack spacing={8} align="stretch">
              <Box>
                <Text fontSize="lg" fontWeight="medium" mb={4}>
                  Upload JSON File
                </Text>
                <Input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  p={1}
                />
                <Text fontSize="sm" color="gray.500" mt={2}>
                  Upload a JSON file containing the record data
                </Text>
              </Box>

              <Divider />

              <Box>
                <Text fontSize="lg" fontWeight="medium" mb={4}>
                  Manual Entry
                </Text>
                <Formik
                  initialValues={{
                    recordId: '',
                    recordName: '',
                    recordDescription: '',
                    recordTags: '',
                    recordInstructions: '',
                  }}
                  onSubmit={handleManualSubmit}
                >
                  {({ values }) => (
                    <Form>
                      <VStack spacing={4} align="stretch">
                        <FormControl>
                          <FormLabel>Record ID</FormLabel>
                          <Field
                            as={Input}
                            name="recordId"
                            placeholder="e.g., phantom-wallet-creation"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>Name</FormLabel>
                          <Field
                            as={Input}
                            name="recordName"
                            placeholder="e.g., Create Phantom Wallet"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>Description</FormLabel>
                          <Field
                            as={Input}
                            name="recordDescription"
                            placeholder="Brief description of the record"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>Tags (comma-separated)</FormLabel>
                          <Field
                            as={Input}
                            name="recordTags"
                            placeholder="e.g., wallet, phantom, crypto, setup"
                          />
                        </FormControl>

                        <FormControl>
                          <FormLabel>Instructions (one per line)</FormLabel>
                          <Field
                            as={Textarea}
                            name="recordInstructions"
                            placeholder="Enter instructions, one per line"
                            minHeight="200px"
                          />
                        </FormControl>

                        <HStack spacing={4}>
                          <Button
                            type="submit"
                            rounded="base"
                            variant="tars-ghost"
                          >
                            Add Record
                          </Button>
                        </HStack>
                      </VStack>
                    </Form>
                  )}
                </Formik>
              </Box>
            </VStack>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
};

export default Settings;

export { Settings as Component };
